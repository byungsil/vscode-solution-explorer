import { SolutionExplorerProvider } from "@SolutionExplorerProvider";
import { SolutionFactory } from "@core/Solutions";
import { TreeItem, TreeItemFactory } from "@tree";
import { CppPropertiesManager } from "@core/Projects/Managers/CppPropertiesManager";
import * as vscode from "vscode";


export class SolutionTreeItemCollection {
	private children: TreeItem[] | undefined = undefined;

	public get length(): number {
		return this.children ? this.children.length : 0;
	}

	public get hasChildren(): boolean {
		return this.children !== undefined;
	}

	public get items(): TreeItem[] {
		return this.children || [];
	}

	public getItem(index: number): TreeItem {
		if (!this.children || !this.children[index]) { throw new Error("Invalid index in SolutionItemCollection"); }
		return this.children[index];
	}

	public reset(): void {
		this.children = undefined;
	}

	public async addSolution(solutionPath: string, rootPath: string, solutionProvider: SolutionExplorerProvider): Promise<void> {
		const solution = await SolutionFactory.load(solutionPath);
		const item = await TreeItemFactory.createFromSolution(solutionProvider, solution, rootPath);
		if (!this.children) {
			this.children = [];
		}

		this.children.push(item);

		// Auto-configure IntelliSense for C++ projects
		this.configureIntelliSenseForCppProjects(solution);
	}

	private async configureIntelliSenseForCppProjects(solution: any): Promise<void> {
		try {
			// Find all C++ projects (.vcxproj files)
			const allProjects = solution.getAllProjects ? solution.getAllProjects() : [];
			const cppProjects = allProjects.filter((project: any) =>
				project.fullPath && project.fullPath.toLowerCase().endsWith('.vcxproj')
			);

			if (cppProjects.length === 0) {
				return; // No C++ projects found
			}

			// Configure IntelliSense for each C++ project silently
			for (const project of cppProjects) {
				try {
					await CppPropertiesManager.configureIntelliSense(project.fullPath, true); // silent = true
				} catch (error) {
					// Silently ignore errors for individual projects
					console.log(`Failed to configure IntelliSense for ${project.fullPath}:`, error);
				}
			}
		} catch (error) {
			// Silently ignore errors
			console.log('Error configuring C++ IntelliSense:', error);
		}
	}

	public getLoadedChildTreeItemById(id: string): TreeItem | undefined {
		if (!this.children) { return undefined; }
		return SolutionTreeItemCollection.getInternalLoadedChildTreeItemById(id, this.children);
	}

	private static getInternalLoadedChildTreeItemById(id: string, children: TreeItem[]): TreeItem | undefined  {
        for (const child of children) {
            if (!child) {
                continue;
            }

            if (child.id === id) {
                return child;
            }

            const found = SolutionTreeItemCollection.getInternalLoadedChildTreeItemById(id, (child as any).children || []);
            if (found) {
                return found;
            }
        }

        return undefined;
    }
}
