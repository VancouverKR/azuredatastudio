/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as env from 'vs/base/common/platform';
import { WindowsExternalTerminalService, MacExternalTerminalService, LinuxExternalTerminalService } from 'vs/workbench/contrib/externalTerminal/node/externalTerminalService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IExternalTerminalService } from 'vs/workbench/contrib/externalTerminal/common/externalTerminal';
import { ExtHostConfigProvider } from 'vs/workbench/api/common/extHostConfiguration';

let externalTerminalService: IExternalTerminalService | undefined = undefined;

export function runInExternalTerminal(args: DebugProtocol.RunInTerminalRequestArguments, configProvider: ExtHostConfigProvider): void {
	if (!externalTerminalService) {
		if (env.isWindows) {
			externalTerminalService = new WindowsExternalTerminalService(<IConfigurationService><unknown>undefined);
		} else if (env.isMacintosh) {
			externalTerminalService = new MacExternalTerminalService(<IConfigurationService><unknown>undefined);
		} else if (env.isLinux) {
			externalTerminalService = new LinuxExternalTerminalService(<IConfigurationService><unknown>undefined);
		}
	}
	if (externalTerminalService) {
		const config = configProvider.getConfiguration('terminal');
		externalTerminalService.runInTerminal(args.title!, args.cwd, args.args, args.env || {}, config.external || {});
	}
}

function spawnAsPromised(command: string, args: string[]): Promise<string> {
	return new Promise((resolve, reject) => {
		let stdout = '';
		const child = cp.spawn(command, args);
		if (child.pid) {
			child.stdout.on('data', (data: Buffer) => {
				stdout += data.toString();
			});
		}
		child.on('error', err => {
			reject(err);
		});
		child.on('close', code => {
			resolve(stdout);
		});
	});
}

export function hasChildProcesses(processId: number | undefined): Promise<boolean> {
	if (processId) {
		// if shell has at least one child process, assume that shell is busy
		if (env.isWindows) {
			return spawnAsPromised('wmic', ['process', 'get', 'ParentProcessId']).then(stdout => {
				const pids = stdout.split('\r\n');
				return pids.some(p => parseInt(p) === processId);
			}, error => {
				return true;
			});
		} else {
			return spawnAsPromised('/usr/bin/pgrep', ['-lP', String(processId)]).then(stdout => {
				const r = stdout.trim();
				if (r.length === 0 || r.indexOf(' tmux') >= 0) { // ignore 'tmux'; see #43683
					return false;
				} else {
					return true;
				}
			}, error => {
				return true;
			});
		}
	}
	// fall back to safe side
	return Promise.resolve(true);
}

const enum ShellType { cmd, powershell, bash }

export function prepareCommand(args: DebugProtocol.RunInTerminalRequestArguments, shell: string): string {

	shell = shell.trim().toLowerCase();

	// try to determine the shell type
	let shellType;
	if (shell.indexOf('powershell') >= 0 || shell.indexOf('pwsh') >= 0) {
		shellType = ShellType.powershell;
	} else if (shell.indexOf('cmd.exe') >= 0) {
		shellType = ShellType.cmd;
	} else if (shell.indexOf('bash') >= 0) {
		shellType = ShellType.bash;
	} else if (env.isWindows) {
		shellType = ShellType.cmd; // pick a good default for Windows
	} else {
		shellType = ShellType.bash;	// pick a good default for anything else
	}

	let quote: (s: string) => string;
	let command = '';

	switch (shellType) {

		case ShellType.powershell:

			quote = (s: string) => {
				s = s.replace(/\'/g, '\'\'');
				if (s.length > 0 && s.charAt(s.length - 1) === '\\') {
					return `'${s}\\'`;
				}
				return `'${s}'`;
			};

			if (args.cwd) {
				command += `cd '${args.cwd}'; `;
			}
			if (args.env) {
				for (let key in args.env) {
					const value = args.env[key];
					if (value === null) {
						command += `Remove-Item env:${key}; `;
					} else {
						command += `\${env:${key}}='${value}'; `;
					}
				}
			}
			if (args.args && args.args.length > 0) {
				const cmd = quote(args.args.shift()!);
				command += (cmd[0] === '\'') ? `& ${cmd} ` : `${cmd} `;
				for (let a of args.args) {
					command += `${quote(a)} `;
				}
			}
			break;

		case ShellType.cmd:

			quote = (s: string) => {
				s = s.replace(/\"/g, '""');
				return (s.indexOf(' ') >= 0 || s.indexOf('"') >= 0 || s.length === 0) ? `"${s}"` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} && `;
			}
			if (args.env) {
				command += 'cmd /C "';
				for (let key in args.env) {
					let value = args.env[key];
					if (value === null) {
						command += `set "${key}=" && `;
					} else {
						value = value.replace(/[\^\&\|\<\>]/g, s => `^${s}`);
						command += `set "${key}=${value}" && `;
					}
				}
			}
			for (let a of args.args) {
				command += `${quote(a)} `;
			}
			if (args.env) {
				command += '"';
			}
			break;

		case ShellType.bash:

			quote = (s: string) => {
				s = s.replace(/([\"\\])/g, '\\$1');
				return (s.indexOf(' ') >= 0 || s.length === 0) ? `"${s}"` : s;
			};

			const hardQuote = (s: string) => {
				return /[^\w@%\/+=,.:^-]/.test(s) ? `'${s.replace(/'/g, '\'\\\'\'')}'` : s;
			};

			if (args.cwd) {
				command += `cd ${quote(args.cwd)} ; `;
			}
			if (args.env) {
				command += 'env';
				for (let key in args.env) {
					const value = args.env[key];
					if (value === null) {
						command += ` -u ${hardQuote(key)}`;
					} else {
						command += ` ${hardQuote(`${key}=${value}`)}`;
					}
				}
				command += ' ';
			}
			for (let a of args.args) {
				command += `${quote(a)} `;
			}
			break;
	}

	return command;
}
