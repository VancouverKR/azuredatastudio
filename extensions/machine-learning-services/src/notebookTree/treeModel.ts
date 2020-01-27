/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as azdata from 'azdata';
const fs = require('fs');
import * as path from 'path';

export class TreeNode implements azdata.TreeComponentItem {

	private _parent?: TreeNode;
	private _folderPath: string;
	private _type: string = '';
	private _name: string = '';
	private _children: TreeNode[] = [];

	constructor(folderPath: string, name: string, parent: TreeNode | undefined) {
		this._folderPath = folderPath;
		this._parent = parent;
		if (name) {
			this._name = name.replace('.ipynb', '');
		}
	}

	public get collapsibleState(): vscode.TreeItemCollapsibleState {

		if (!this.isAlwaysLeaf) {
			return vscode.TreeItemCollapsibleState.Expanded;
		} else {
			return vscode.TreeItemCollapsibleState.None;
		}
	}

	public get label(): string {
		return this._name;
	}

	/**
	 * Is this a leaf node (in which case no children can be generated) or is it expandable?
	 */
	public get isAlwaysLeaf(): boolean {
		// tslint:disable-next-line:no-sync
		return fs.lstatSync(this._folderPath).isFile();
	}

	/**
	 * Parent of this node
	 */
	public get parent(): TreeNode | undefined {
		return this._parent;
	}

	public get data(): string {
		return this._folderPath;
	}

	public get type(): string {
		return this._type;
	}

	public set type(value: string) {
		this._type = value;
	}

	public get hasChildren(): boolean {
		return this.children !== undefined && this.children.length > 0;
	}

	/**
	 * Children of this node
	 */
	public get children(): TreeNode[] {
		if (this._children && this._children.length > 0) {
			return this._children;
		} else {
			this._children = [];
		}

		// tslint:disable-next-line:no-sync
		let files = fs.readdirSync(this._folderPath);
		this._children = new Array<TreeNode>(files.length);
		for (let index = 0; index < files.length; index++) {
			const file = files[index];
			let node = new TreeNode(path.join(this._folderPath, file), file, this);
			if (file.endsWith('.ipynb')) {
				node.type = 'book';
			} else if (node.isAlwaysLeaf) {
				continue;
			} else {
				node.type = 'folder';
			}

			if (this._name === 'Deploy MLFlow') {
				if (file === 'Deploy MLFlow.ipynb') {
					this._children[0] = node;
				} else {
					this._children.push(node);
				}
			} else if (this._name === 'Machine Learning Notebooks') {
				if (file === 'Train, Convert, and Deploy with ONNX.ipynb') {
					this._children[0] = node;
				} else if (file === 'Native PREDICT on Azure SQL Database Edge.ipynb') {
					this._children[1] = node;
				} else {
					this._children.push(node);
				}
			} else if (this._name === 'root') {
				if (file === 'Machine Learning Notebooks') {
					this._children[0] = node;
				} else if (file === 'Deploy MLFlow') {
					this._children[1] = node;
				} else {
					this._children.push(node);
				}
			} else if (this._name === 'Deploy Cognitive Services') {
				if (file === 'Deploy Cognitive Services.ipynb') {
					this._children[0] = node;
				} else {
					this._children.push(node);
				}
			} else {
				this._children.push(node);
			}
		}

		return this._children;
	}
}
