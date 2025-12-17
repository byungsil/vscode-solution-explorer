import { TreeItem } from "@tree";
import { SingleItemActionsCommand } from "@commands";
import { Action, ConfigureIntelliSense } from "@actions";

export class ConfigureIntelliSenseCommand extends SingleItemActionsCommand {
    constructor() {
        super('Configure C++ IntelliSense');
    }

    public shouldRun(item: TreeItem | undefined): boolean {
        // Only run for vcxproj files
        return !!item && !!item.path && item.path.toLowerCase().endsWith('.vcxproj');
    }

    public getActions(item: TreeItem | undefined): Promise<Action[]> {
        if (!item) {
            return Promise.resolve([]);
        }
        return Promise.resolve([new ConfigureIntelliSense(item)]);
    }
}
