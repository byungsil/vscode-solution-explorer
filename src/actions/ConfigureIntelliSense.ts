import { Action, ActionContext } from "./base/Action";
import { TreeItem } from "@tree/TreeItem";
import { CppPropertiesManager } from "@core/Projects/Managers/CppPropertiesManager";
import * as vscode from "vscode";

export class ConfigureIntelliSense implements Action {
    constructor(private readonly treeItem: TreeItem) {
    }

    public async execute(context: ActionContext): Promise<void> {
        if (context.cancelled) {
            return;
        }

        // Check if this is a vcxproj file
        if (!this.treeItem.path || !this.treeItem.path.toLowerCase().endsWith('.vcxproj')) {
            vscode.window.showErrorMessage('This command is only available for C++ project files (.vcxproj).');
            return;
        }

        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Configuring IntelliSense...",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: "Extracting include paths from project file..." });

            await CppPropertiesManager.configureIntelliSense(this.treeItem.path!);
        });
    }

    public toString(): string {
        return `Configure C++ IntelliSense for ${this.treeItem.label}`;
    }
}
