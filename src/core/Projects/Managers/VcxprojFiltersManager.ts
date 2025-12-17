import * as fs from "@extensions/fs";
import * as xml from "@extensions/xml";
import { XmlElement } from "@extensions/xml";
import { VcxprojFilterEntry } from "../Items/VcxprojFilter";

export class VcxprojFiltersManager {
    private filters: Map<string, Set<string>> = new Map(); // filter path -> set of file paths
    private fileToFilter: Map<string, string> = new Map(); // file path -> filter path

    constructor(private readonly filtersFilePath: string) {
    }

    public async load(): Promise<void> {
        if (!(await fs.exists(this.filtersFilePath))) {
            return;
        }

        try {
            const content = await fs.readFile(this.filtersFilePath);
            const document = await xml.parseToJson(content) as XmlElement;

            if (!document) {
                return;
            }

            const project = this.getProjectElement(document);
            if (!project || !project.elements) {
                return;
            }

            // Parse ItemGroup elements to find file-to-filter mappings
            project.elements.forEach((element: XmlElement) => {
                if (element.name === 'ItemGroup' && element.elements) {
                    element.elements.forEach((item: XmlElement) => {
                        // Look for items with Include attribute (files)
                        if (item.attributes && item.attributes.Include) {
                            const includePath = item.attributes.Include;

                            // Find the Filter child element
                            if (item.elements) {
                                const filterElement = item.elements.find((e: XmlElement) => e.name === 'Filter');
                                if (filterElement && filterElement.elements && filterElement.elements.length > 0) {
                                    const filterText = filterElement.elements[0].text;
                                    if (filterText) {
                                        this.addFileToFilter(includePath, filterText);
                                    }
                                }
                            }
                        }
                    });
                }
            });
        } catch (error) {
            console.error('Error loading vcxproj.filters file:', error);
        }
    }

    private addFileToFilter(filePath: string, filterPath: string): void {
        // Normalize the file path (convert backslashes to forward slashes for consistent comparison)
        const normalizedFilePath = filePath.toLowerCase().replace(/\\/g, '/');

        // Store with full path
        this.fileToFilter.set(normalizedFilePath, filterPath);

        // Also store with just filename for fallback matching
        const filename = filePath.split(/[\\/]/).pop()?.toLowerCase();
        if (filename) {
            this.fileToFilter.set(filename, filterPath);
        }

        if (!this.filters.has(filterPath)) {
            this.filters.set(filterPath, new Set());
        }
        this.filters.get(filterPath)!.add(normalizedFilePath);
    }

    public getFilterForFile(filePath: string): string | undefined {
        const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');

        // Try exact match first
        let filter = this.fileToFilter.get(normalizedPath);

        // Try filename only
        if (!filter) {
            const filename = filePath.split(/[\\/]/).pop()?.toLowerCase();
            if (filename) {
                filter = this.fileToFilter.get(filename);
            }
        }

        return filter;
    }

    public getAllFilters(): string[] {
        return Array.from(this.filters.keys());
    }

    public hasFilters(): boolean {
        return this.filters.size > 0;
    }

    private getProjectElement(document: XmlElement): XmlElement | undefined {
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
    }
}
