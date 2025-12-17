import * as path from "@extensions/path";
import * as nodePath from "path";
import * as fs from "@extensions/fs";
import * as glob from "@extensions/glob";
import { ProjectItemEntry } from "./ProjectItemEntry";
import { IncludeBase } from "./IncludeBase";

export class Include extends IncludeBase {

    constructor(type: string, value: string, link?: string, linkBase?: string, public readonly exclude?: string, public readonly dependentUpon?: string) {
        super(type, value, link, linkBase);
    }

    public async getEntries(projectBasePath: string, entries: ProjectItemEntry[], filtersManager?: any): Promise<ProjectItemEntry[]> {
        for (const pattern of this.value.split(';')) {
            // Check if the pattern is an absolute path (C++/vcxproj often uses absolute paths)
            const isAbsolutePath = nodePath.isAbsolute(pattern);

            // For absolute paths outside the project, treat them as external links without glob expansion
            if (isAbsolutePath) {
                const normalizedPattern = nodePath.normalize(pattern);
                // Check if absolute path is outside project directory
                const isOutsideProject = !normalizedPattern.toLowerCase().startsWith(projectBasePath.toLowerCase());

                if (isOutsideProject) {
                    // For external absolute paths, add single entry without glob expansion
                    await this.addSingleFileEntry(normalizedPattern, projectBasePath, entries, true, filtersManager);
                    continue;
                }
            }

            // Avoid glob expansion for patterns that would traverse upwards excessively
            const cleanedPattern = this.cleanPathDownAtStart(pattern);
            if (pattern.startsWith("..") && pattern.split("..").length > 10) {
                // Too many parent directory traversals, skip to prevent OOM
                console.warn(`Skipping pattern with excessive parent directory traversals: ${pattern}`);
                continue;
            }

            const internalPath = this.getInternalPath(cleanedPattern);
            const searchPath = glob.isGlobPattern(cleanedPattern) ? path.join(projectBasePath, internalPath) : projectBasePath;

            let result: string[];
            try {
                result = await glob.globFileSearch(searchPath, cleanedPattern, this.exclude ? this.exclude?.split(';') : undefined);
            } catch (e) {
                console.error(`Error in glob search for pattern ${pattern}:`, e);
                continue;
            }

            for (const filepath of result) {
                await this.addFileEntry(filepath, projectBasePath, entries, filtersManager);
            }
        }

        return entries;
    }

    private async addFilteredEntry(filepath: string, projectBasePath: string, entries: ProjectItemEntry[], filterPath: string): Promise<void> {
        const filename = path.basename(filepath);
        // Use filter path instead of actual file path for relative path
        const relativePath = path.join(filterPath, filename).replace(/\\/g, '/');

        let isDirectory: boolean;
        try {
            isDirectory = await fs.isDirectory(filepath);
        } catch (e) {
            // If file doesn't exist or can't access, treat based on extension
            isDirectory = path.extname(filepath) === "";
        }

        const exists = entries.find(e => e.relativePath === relativePath);
        if (!exists) {
            // Create filter folders
            const filterFolders = this.createFilterFoldersIfNotExists(entries, filterPath);
            if (filterFolders.length > 0) {
                entries.push(...filterFolders);
            }

            entries.push({
                name: filename,
                fullPath: filepath,
                relativePath: relativePath,
                isDirectory: isDirectory,
                isLink: true, // Mark as link since it's using virtual filter path
                dependentUpon: this.dependentUpon
            });
        }
    }

    private createFilterFoldersIfNotExists(entries: ProjectItemEntry[], filterPath: string): ProjectItemEntry[] {
        const folderEntries: ProjectItemEntry[] = [];
        const segments = filterPath.split(/[\\/]/);
        let currentPath = "";

        for (const segment of segments) {
            if (!segment) continue;

            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            const exists = entries.find(e => e.relativePath === currentPath && e.isDirectory);

            if (!exists) {
                folderEntries.push({
                    name: segment,
                    fullPath: "", // Virtual folder has no real path
                    relativePath: currentPath,
                    isDirectory: true,
                    isLink: true,
                    dependentUpon: undefined
                });
            }
        }

        return folderEntries;
    }

    private async addSingleFileEntry(filepath: string, projectBasePath: string, entries: ProjectItemEntry[], isLink: boolean, filtersManager?: any): Promise<void> {
        const filename = path.basename(filepath);
        let relativePath: string;

        // Debug: log first few files
        if (entries.length < 5) {
            console.log(`[Include.addSingleFileEntry] File: ${filepath}`);
            console.log(`[Include.addSingleFileEntry] Has filtersManager: ${!!filtersManager}, hasFilters: ${filtersManager?.hasFilters()}`);
        }

        // Check if we have a filter for this file
        if (filtersManager && filtersManager.hasFilters()) {
            const filterPath = filtersManager.getFilterForFile(filepath);

            if (entries.length < 5) {
                console.log(`[Include.addSingleFileEntry] Filter path: ${filterPath || 'NO FILTER'}`);
            }

            if (filterPath) {
                relativePath = path.join(filterPath, filename).replace(/\\/g, '/');
                isLink = true;

                // Create filter folders
                const filterFolders = this.createFilterFoldersIfNotExists(entries, filterPath);
                if (filterFolders.length > 0) {
                    entries.push(...filterFolders);
                }
            } else {
                relativePath = path.relative(projectBasePath, filepath);
            }
        } else {
            relativePath = path.relative(projectBasePath, filepath);
        }

        let isDirectory: boolean;
        try {
            isDirectory = await fs.isDirectory(filepath);
        } catch (e) {
            // If file doesn't exist or can't access, treat based on extension
            isDirectory = path.extname(filepath) === "";
        }

        const exists = entries.find(e => e.relativePath === relativePath);
        if (!exists) {
            // Only create folders if not using filter path (filter folders already created above)
            if (!filtersManager || !filtersManager.hasFilters() || !filtersManager.getFilterForFile(filepath)) {
                const folderEntries = this.createFoldersIfNotExists(entries, relativePath, filepath, isLink);
                if (folderEntries.length > 0) {
                    entries.push(...folderEntries);
                }
            }

            entries.push({
                name: filename,
                fullPath: filepath,
                relativePath: relativePath,
                isDirectory: isDirectory,
                isLink: isLink,
                dependentUpon: this.dependentUpon
            });
        }
    }

    private async addFileEntry(filepath: string, projectBasePath: string, entries: ProjectItemEntry[], filtersManager?: any): Promise<void> {
        // Check if we have a filter for this file (for C++ projects)
        let relativePath: string;
        let isLink = false;

        if (filtersManager && filtersManager.hasFilters()) {
            const filterPath = filtersManager.getFilterForFile(filepath);

            if (filterPath) {
                // Use filter path as the virtual path
                const filename = path.basename(filepath);
                relativePath = path.join(filterPath, filename).replace(/\\/g, '/');
                isLink = true; // Mark as link since using virtual path

                // Create filter folders
                const filterFolders = this.createFilterFoldersIfNotExists(entries, filterPath);
                if (filterFolders.length > 0) {
                    entries.push(...filterFolders);
                }
            } else {
                // No filter found, use regular path
                const recursiveDir = this.getRecursiveDir(filepath, projectBasePath);
                relativePath = this.getRelativePath(filepath, recursiveDir);
                isLink = !filepath.startsWith(projectBasePath);
                const folderEntries: ProjectItemEntry[] = this.createFoldersIfNotExists(entries, relativePath, filepath, isLink);
                if (folderEntries.length > 0) {
                    entries.push(...folderEntries);
                }
            }
        } else {
            // No filter manager, use regular path
            const recursiveDir = this.getRecursiveDir(filepath, projectBasePath);
            relativePath = this.getRelativePath(filepath, recursiveDir);
            isLink = !filepath.startsWith(projectBasePath);
            const folderEntries: ProjectItemEntry[] = this.createFoldersIfNotExists(entries, relativePath, filepath, isLink);
            if (folderEntries.length > 0) {
                entries.push(...folderEntries);
            }
        }

        const filename = path.basename(relativePath);
        let isDirectory: boolean;
        try {
            isDirectory = await fs.isDirectory(filepath);
        } catch (e) {
            isDirectory = path.extname(filepath) === "";
        }

        const exists = entries.find(e => e.relativePath === relativePath);
        if (!exists) {
            entries.push({
                name: filename,
                fullPath: filepath,
                relativePath: relativePath,
                isDirectory: isDirectory,
                isLink: isLink,
                dependentUpon: this.dependentUpon
            });
        }
    }

    private createFoldersIfNotExists( entries: ProjectItemEntry[], relativePath: string, filepath: string, isLink: boolean): ProjectItemEntry[] {
        const folderEntries: ProjectItemEntry[] = [];
        let relativeFolder = path.dirname(relativePath);
        filepath = path.dirname(filepath);
        while (relativeFolder && relativeFolder !== ".") {
            const folder = entries.find(e => e.relativePath === relativeFolder);
            if (!folder) {
                folderEntries.push({
                    name: path.basename(relativeFolder),
                    fullPath: filepath,
                    relativePath: relativeFolder,
                    isDirectory: true,
                    isLink: isLink,
                    dependentUpon: undefined
                });
            }

            relativeFolder = path.dirname(relativeFolder);
            filepath = path.dirname(filepath);
        }

        return folderEntries.reverse();
    }

    public isPathIncluded(projectBasePath: string, sourcePath: string): boolean {
        return this.testIncluded(projectBasePath, sourcePath) && !this.testExcluded(projectBasePath, sourcePath);
    }

    private testIncluded(projectBasePath: string, text: string): boolean {
        return glob.globTest(this.value.split(';').map(s => path.join(projectBasePath, s)), text);
    }

    private testExcluded(projectBasePath: string, text: string): boolean {
        return glob.globTest((this.exclude ? this.exclude.split(';') : []).map(s => path.join(projectBasePath, s)), text);
    }

    private getInternalPath(value: string): string {
        const search = (c: string) => {
            const index = value.indexOf('*');
            if (index < 0) {
                return value.length;
            }

            return index;
        }
        const index = Math.min(
                        search('*'),
                        search('?'),
                        search('['),
                        search('{'));

        return path.dirname(value.substring(0, index + 1));
    }

    private cleanPathDownAtStart(filepath: string): string {
        const folderDown = ".." + path.sep;
        while(filepath.startsWith(folderDown)) {
            filepath = filepath.substring(folderDown.length);
        }

        return filepath;
    }

}
