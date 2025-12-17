import * as fs from "@extensions/fs";
import * as path from "@extensions/path";
import * as xml from "@extensions/xml";
import { XmlElement } from "@extensions/xml";
import * as vscode from "vscode";

export interface CppConfiguration {
    name: string;
    includePath: string[];
    defines: string[];
    compilerPath?: string;
    cStandard?: string;
    cppStandard?: string;
    intelliSenseMode?: string;
}

export interface CppProperties {
    configurations: CppConfiguration[];
    version: number;
}

export class CppPropertiesManager {
    private static readonly CONFIG_FILE = "c_cpp_properties.json";
    private static readonly VSCODE_DIR = ".vscode";

    /**
     * Extract preprocessor definitions from vcxproj file
     */
    public static async extractDefines(vcxprojPath: string): Promise<string[]> {
        try {
            const content = await fs.readFile(vcxprojPath);
            const document = await xml.parseToJson(content) as XmlElement;

            if (!document || !document.elements) {
                return [];
            }

            const project = this.findProjectElement(document);
            if (!project || !project.elements) {
                return [];
            }

            const defines = new Set<string>();

            // Find ItemDefinitionGroup elements
            project.elements.forEach((element: XmlElement) => {
                if (element.name === 'ItemDefinitionGroup' && element.elements) {
                    // Find ClCompile element
                    const clCompile = element.elements.find((e: XmlElement) => e.name === 'ClCompile');
                    if (clCompile && clCompile.elements) {
                        // Find PreprocessorDefinitions element
                        const definesElem = clCompile.elements.find((e: XmlElement) => e.name === 'PreprocessorDefinitions');
                        if (definesElem && definesElem.elements && definesElem.elements.length > 0) {
                            const definesText = definesElem.elements[0].text;
                            if (definesText) {
                                // Split by semicolon and clean up
                                const defs = definesText.split(';');
                                defs.forEach((d: string) => {
                                    const cleanDef = d.trim();
                                    // Skip MSBuild variables and special macros
                                    if (cleanDef &&
                                        !cleanDef.includes('$(') &&
                                        cleanDef !== '%(PreprocessorDefinitions)') {
                                        defines.add(cleanDef);
                                    }
                                });
                            }
                        }
                    }
                }
            });

            return Array.from(defines);
        } catch (error) {
            console.error('Error extracting defines:', error);
            return [];
        }
    }

    /**
     * Extract include paths from vcxproj file
     */
    public static async extractIncludePaths(vcxprojPath: string): Promise<string[]> {
        try {
            const content = await fs.readFile(vcxprojPath);
            const document = await xml.parseToJson(content) as XmlElement;

            if (!document || !document.elements) {
                return [];
            }

            const project = this.findProjectElement(document);
            if (!project || !project.elements) {
                return [];
            }

            const includePaths = new Set<string>();
            const projectDir = path.dirname(vcxprojPath);

            // Find ItemDefinitionGroup elements
            project.elements.forEach((element: XmlElement) => {
                if (element.name === 'ItemDefinitionGroup' && element.elements) {
                    // Find ClCompile element
                    const clCompile = element.elements.find((e: XmlElement) => e.name === 'ClCompile');
                    if (clCompile && clCompile.elements) {
                        // Find AdditionalIncludeDirectories element
                        const includeElem = clCompile.elements.find((e: XmlElement) => e.name === 'AdditionalIncludeDirectories');
                        if (includeElem && includeElem.elements && includeElem.elements.length > 0) {
                            const includeText = includeElem.elements[0].text;
                            if (includeText) {
                                // Remove all quotes first, then split by semicolon
                                const cleanedText = includeText.replace(/"/g, '');
                                const paths = cleanedText.split(';');

                                paths.forEach((p: string) => {
                                    let cleanPath = p.trim();
                                    if (cleanPath && !cleanPath.includes('$(')) { // Skip MSBuild variables
                                        // Filter out system paths and only keep project-relative paths
                                        if (!cleanPath.toLowerCase().includes('windows kits') &&
                                            !cleanPath.toLowerCase().includes('microsoft visual studio') &&
                                            cleanPath !== '%(AdditionalIncludeDirectories)') {

                                            // Normalize path separators
                                            cleanPath = cleanPath.replace(/\\/g, '/');

                                            // Convert to absolute path based on project directory
                                            let absolutePath: string;
                                            if (path.isAbsolute(cleanPath)) {
                                                absolutePath = cleanPath;
                                            } else {
                                                absolutePath = path.join(projectDir, cleanPath).replace(/\\/g, '/');
                                            }

                                            includePaths.add(absolutePath);
                                        }
                                    }
                                });
                            }
                        }
                    }
                }
            });

            return Array.from(includePaths);
        } catch (error) {
            console.error('Error extracting include paths:', error);
            return [];
        }
    }

    /**
     * Create or update c_cpp_properties.json
     */
    public static async createOrUpdateCppProperties(workspaceRoot: string, includePaths: string[], defines: string[]): Promise<void> {
        const vscodeDir = path.join(workspaceRoot, this.VSCODE_DIR);
        const configPath = path.join(vscodeDir, this.CONFIG_FILE);

        // Ensure .vscode directory exists
        if (!(await fs.exists(vscodeDir))) {
            await fs.mkdir(vscodeDir);
        }

        // Read existing configuration if it exists
        let existingConfig: CppConfiguration | undefined;
        if (await fs.exists(configPath)) {
            try {
                const existingContent = await fs.readFile(configPath);
                const existingProperties = JSON.parse(existingContent) as CppProperties;
                existingConfig = existingProperties.configurations.find(c => c.name === 'Win32');
            } catch (error) {
                console.log('[CppPropertiesManager] Could not read existing config, creating new one:', error);
            }
        }

        // Merge include paths from existing config
        const allIncludePaths = new Set<string>(['${workspaceFolder}/**']);
        if (existingConfig && existingConfig.includePath) {
            existingConfig.includePath.forEach(p => allIncludePaths.add(p));
        }
        includePaths.forEach(p => allIncludePaths.add(p));

        // Merge defines from existing config
        const allDefines = new Set<string>();
        if (existingConfig && existingConfig.defines) {
            existingConfig.defines.forEach(d => allDefines.add(d));
        }
        defines.forEach(d => allDefines.add(d));

        // Create Win32 configuration with merged data
        const config: CppConfiguration = {
            name: 'Win32',
            includePath: Array.from(allIncludePaths),
            defines: Array.from(allDefines),
            intelliSenseMode: 'windows-msvc-x64',
            cStandard: 'c17',
            cppStandard: 'c++17'
        };

        // Create properties with only Win32 configuration
        const cppProperties: CppProperties = {
            configurations: [config],
            version: 4
        };

        // Write config file
        const content = JSON.stringify(cppProperties, null, 4);
        await fs.writeFile(configPath, content);
    }

    /**
     * Configure IntelliSense for a vcxproj file
     * @param vcxprojPath Path to the .vcxproj file
     * @param silent If true, don't show any notifications (for auto-configuration)
     */
    public static async configureIntelliSense(vcxprojPath: string, silent: boolean = false): Promise<boolean> {
        try {
            // Extract include paths from vcxproj
            const includePaths = await this.extractIncludePaths(vcxprojPath);

            // Extract preprocessor definitions from vcxproj
            const defines = await this.extractDefines(vcxprojPath);

            if (includePaths.length === 0 && defines.length === 0) {
                if (!silent) {
                    vscode.window.showWarningMessage('No include paths or preprocessor definitions found in project file.');
                }
                return false;
            }

            // Find workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                if (!silent) {
                    vscode.window.showErrorMessage('No workspace folder found.');
                }
                return false;
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;

            // Create or update c_cpp_properties.json
            await this.createOrUpdateCppProperties(workspaceRoot, includePaths, defines);

            // Reload C++ IntelliSense configuration
            try {
                await vscode.commands.executeCommand('C_Cpp.ReloadWindowConfigurations');
            } catch (error) {
                // Command might not be available if C++ extension is not installed
                console.log('Could not reload C++ configurations:', error);
            }

            if (!silent) {
                vscode.window.showInformationMessage(
                    `IntelliSense configured with ${includePaths.length} include paths and ${defines.length} preprocessor definitions.`
                );
            }

            return true;
        } catch (error) {
            if (!silent) {
                vscode.window.showErrorMessage(`Failed to configure IntelliSense: ${error}`);
            }
            return false;
        }
    }

    private static createDefaultConfig(): CppProperties {
        return {
            configurations: [],
            version: 4
        };
    }

    private static findProjectElement(document: XmlElement): XmlElement | undefined {
        if (document && document.elements) {
            if (document.elements.length === 1) {
                return document.elements[0];
            } else {
                for (let i = 0; i < document.elements.length; i++) {
                    if (document.elements[i].type !== 'comment') {
                        return document.elements[i];
                    }
                }
            }
        }
        return undefined;
    }
}
