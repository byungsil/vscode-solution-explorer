export class VcxprojFilter {
    public name: string;
    public fullPath: string;
    public items: Map<string, string> = new Map(); // filename -> filter path

    constructor(name: string) {
        this.name = name;
        this.fullPath = name;
    }
}

export class VcxprojFilterEntry {
    public filterPath: string;
    public filePath: string;
    public itemType: string;

    constructor(filterPath: string, filePath: string, itemType: string) {
        this.filterPath = filterPath;
        this.filePath = filePath;
        this.itemType = itemType;
    }
}
