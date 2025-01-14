'use strict';

var
    child_process = require('child_process'),
    escapeArg;

// Host operating system
if (/^win/.test(process.platform)) {
    escapeArg = function (arg) {
        if (arg === undefined) arg = '';
        arg = arg + '';
        if (!/\s|[\\"\]]/.test(arg) && arg.length > 0 /* escape empty args as "" */) return arg;

        return '"' + arg.replace(/"/g, '""') + '"';
    };
} else {
    escapeArg = function (arg) {
        if (arg === undefined) arg = '';
        arg = arg + '';
        if (!/\s|[\\"\]]/.test(arg) && arg.length > 0 /* escape empty args as "" */) return arg;

        return '"' + arg.replace(/"/g, '\\"') + '"';
    };
}

var cleanStdout = function (stdout) {
    return stdout.replace(/[\r\n]$/, '');
};

/** @enum {String} VMWareHostType */
var VMWareHostType = {
    SERVER1: 'server1'
    , SERVER2: 'server'
    , WORKSTATION: 'ws'
    , PLAYER: 'player'
    , WORKSTATION_SHARED: 'ws-shared'
    , ESX: 'esx'
    , FUSION: 'fusion'
    , VCENTER_SERVER: 'vc'
};

/**
 * @param {String} type
 * @returns {VMWareHostType}
 */
var resolveHostType = function (type) {
    switch (((type || '') + '').toLowerCase()) {
        default:
        case 'ws':
        case 'workstation':
            return VMWareHostType.WORKSTATION;
            
        case 'player':
            return VMWareHostType.PLAYER;
        
        case 'fusion':
            return VMWareHostType.FUSION;

        case 'server1': return VMWareHostType.SERVER1;
        case 'server':
        case 'server2':
            return VMWareHostType.SERVER2;

        case 'ws-shared':
        case 'wsshared':
        case 'ws_shared':
            return VMWareHostType.WORKSTATION_SHARED;

        case 'esx': return VMWareHostType.ESX;
        case 'vc':
        case 'vcenter':
            return VMWareHostType.VCENTER_SERVER;
    }
};

var validPath = function (path) {
    return (path + '').replace(/[\/\\]*$/, '');
};

var extend = function (dest) {

    for (var i = 1, len = arguments.length; i < len; i++) {
        var o = arguments[i];
        if (!o) continue;

        for (var key in o) {
            if (!o.hasOwnProperty(key)) continue;
            dest[key] = o[key];
        }
    }

    return dest;
};

/**
 * @constructor
 */
var VMRun = function () {};

/**
 *
 * @param {Object?} options
 * @param {String?} options.vmrunPath
 * @param {String?} options.hostName
 * @param {Number?} options.hostPort
 * @param {VMWareHostType?} options.hostType
 * @param {String?} options.hostUsername
 * @param {String?} options.hostPassword
 * @param {String?} options.guestUsername
 * @param {String?} options.guestPassword
 * @param {String?} options.vmPassword
 * @returns {VMRun}
 */
VMRun.prototype.setOptions = function (options) {
    options = options || {};
    var opts = {};
    opts.vmrunPath = (options.vmrunPath || typeof options.vmrunPath === 'string')
        ? escapeArg(options.vmrunPath)
        : "vmrun";
    opts.hostName = options.hostName || false;
    opts.hostPort = options.hostPort || false;
    opts.hostType = resolveHostType(options.hostType);
    opts.hostUsername = options.hostUsername || false;
    opts.hostPassword = (options.hostPassword || typeof options.hostPassword === 'string')
        ? options.hostPassword
        : false;
    opts.guestUsername = options.guestUsername || false;
    opts.guestPassword = (options.guestPassword || typeof options.guestPassword === 'string')
        ? options.guestPassword
        : false;
    opts.vmPassword = options.vmPassword || false;
    this._options = options;
    return this;
};

/**
 * @typedef {Object} VMRunOptions
 * @property {String|undefined} vmrunPath?
 * @property {String|undefined} hostName?
 * @property {String|Number|undefined} hostPort?
 * @property {VMWareHostType|undefined} hostType?
 * @property {String|undefined} hostUsername?
 * @property {String|undefined} hostPassword?
 * @property {String|undefined} guestUsername?
 * @property {String|undefined} guestPassword?
 * @property {String|undefined} vmPassword?
 *
 */

//noinspection JSUnusedGlobalSymbols
/**
 * Returns a new VMRun instance with different options
 * @param {VMRunOptions?} options
 * @returns {VMRun} new VMRun instance
 */
VMRun.prototype.withOptions = function (options) {
    var instance = new VMRun();
    return instance.setOptions(options);
};

//noinspection JSUnusedGlobalSymbols
/**
 * Returns a new VMRun instance with different options, inheriting from current options
 * @param {VMRunOptions?} options
 * @returns {VMRun} new VMRun instance
 */
VMRun.prototype.withModifiedOptions = function (options) {
    var instance = new VMRun();
    return instance.setOptions(extend(this._options, options));
};

/**
 * Call a VMRun command
 * @param {String} command
 * @param {[String]?} args
 * @param {VMRunOptions?} options
 * @param {[String]?} unesc_args
 * @returns {Promise<{stdout, stderr}>}
 */
VMRun.vmrunWithOptions = function (command, args, options, unesc_args) {

    var runArgs = [];

    // Host arguments
    runArgs.push('-T', resolveHostType(options.hostType));
    if (options.hostName) {
        runArgs.push('-h', options.hostName);
    }
    if (options.hostPort) {
        runArgs.push('-P', options.hostPort);
    }
    if (options.hostUsername) {
        runArgs.push('-u', options.hostUsername);
    }
    if (options.hostPassword) {
        runArgs.push('-p', options.hostPassword);
    }
    if (options.vmPassword) {
        runArgs.push('-vp', options.vmPassword);
    }
    if (options.guestUsername || options.guestPassword) {
        runArgs.push('-gu', options.guestUsername || '');
        runArgs.push('-gp', options.guestPassword || '');
    }

    // Command
    runArgs.push(command);

    // Arguments
    if (args) {
        runArgs = runArgs.concat(args);
    }

    for (var i = 0; i < runArgs.length; i++) {
        runArgs[i] = escapeArg(runArgs[i]);
    }

    if (unesc_args) {
        runArgs = runArgs.concat(unesc_args);
    }

    if (VMRun.debug) {
        console.warn('$ vmrun ' + runArgs.join(' '));
    }

    return new Promise(function (resolve, reject) {

        child_process.exec(options.vmrunPath + ' ' + runArgs.join(' '), {}, function (err, stdout, stderr) {

            if (err) {
                if (/^Error: /.test(stderr || stdout)) {
                    err.message = ((stderr || stdout).substr(7)).trim() + '\n    cmd: ' + err.cmd;
                }
                return reject(err);
            }

            return resolve({ stdout: stdout, stderr: stderr });

        });

    });
};

/**
 * Call a VMRun command
 * @param {String} command
 * @param {[String]?} args
 * @param {[String]?} unesc_args
 * @returns {Promise<{stdout, stderr}>}
 */
VMRun.prototype.vmrun = function (command, args, unesc_args) {
    return VMRun.vmrunWithOptions(command, args, this._options, unesc_args);
};

/**
 * @param {String} vmxFile
 * @param {Boolean} gui=false Should the gui be visible or not?
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.start = function (vmxFile, gui) {
    return this.vmrun('start', [vmxFile, gui ? 'gui' : 'nogui']);
};

/**
 * Hardware shutdown
 * @param {String} vmxFile
 * @returns {Promise.<Boolean>} Promise resolved to whether the machine was on or not
 */
VMRun.prototype.poweroff = VMRun.prototype.powerOff = function (vmxFile) {
    return this.vmrun('stop', [vmxFile, 'hard'])
        .then(function () {
            return true;
        })
        .catch(function (err) {
            if (err.message.indexOf('is not powered on')) {
                return false;
            }
            throw err;
        });
};

/**
 * Softwaree shutdown
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.shutdown = function (vmxFile) {
    return this.vmrun('stop', [vmxFile, 'soft']);
};

/**
 * Hardware restart
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.reset = function (vmxFile) {
    return this.vmrun('reset', [vmxFile, 'hard']);
};

/**
 * Software restart
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.restart = function (vmxFile) {
    return this.vmrun('reset', [vmxFile, 'soft']);
};

/**
 * @param {String} vmxFile
 * @param {Boolean?} hard=false
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.suspend = function (vmxFile, hard) {
    return this.vmrun('suspend', [vmxFile, hard ? 'hard' : 'soft']);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.pause = function (vmxFile) {
    return this.vmrun('pause', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.unpause = function (vmxFile) {
    return this.vmrun('unpause', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<[String]>}
 */
VMRun.prototype.listSnapshots = function (vmxFile) {
    return this.vmrun('listSnapshots', [vmxFile])
        .then(function (std) {

            var idx = std.stdout.indexOf('Total snapshots');
            if (idx > -1) {
                idx = std.stdout.indexOf('\n', idx);
            }

            var list = std.stdout.substr(idx).trim().split('\n');
            idx = list.indexOf('');
            if (idx > -1) {
                list.splice(idx, 1);
            }

            return list;
        });
};

/**
 * @param {String} vmxFile
 * @param {String} snapshotName
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.snapshot = function (vmxFile, snapshotName) {
    return this.vmrun('snapshot', [vmxFile, snapshotName]);
};

/**
 * @param {String} vmxFile
 * @param {String} snapshotName
 * @param {Boolean?} deleteChildren=false
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.deleteSnapshot = function (vmxFile, snapshotName, deleteChildren) {
    var args = [vmxFile, snapshotName];
    if (deleteChildren) {
        args.push('andDeleteChildren');
    }
    return this.vmrun('deleteSnapshot', args);
};

/**
 * @param {String} vmxFile
 * @param {String} snapshotName
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.revertToSnapshot = function (vmxFile, snapshotName) {
    return this.vmrun('revertToSnapshot', [vmxFile, snapshotName]);
};

/**
 * @param {String} vmxFile
 * @param {String} pathToProgram
 * @param {[String]} programArgs
 * @param {Object?} options
 * @param {Boolean} options.noWait=false
 * @param {Boolean} options.activeWindow=false
 * @param {Boolean} options.interactive=false
 * @param {[String]?} unesc_args
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.runProgramInGuest = function (vmxFile, pathToProgram, programArgs, options, unesc_args) {
    var args = [vmxFile];
    if (options) {
        if (options.noWait) {
            args.push('-noWait');
        }
        if (options.activeWindow) {
            args.push('-activeWindow');
        }
        if (options.interactive) {
            args.push('-interactive');
        }
    }
    args.push(validPath(pathToProgram));
    if (programArgs) {
        args = args.concat(programArgs);
    }
    return this.vmrun('runProgramInGuest', args, unesc_args);
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<Boolean>}
 */
VMRun.prototype.fileExistsInGuest = function (vmxFile, path) {
    return this.vmrun('fileExistsInGuest', [vmxFile, validPath(path)])
        .then(function (std) {

            return std.stdout.indexOf('file exists') > -1;
        });
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<Boolean>}
 */
VMRun.prototype.directoryExistsInGuest = function (vmxFile, path) {
    return this.vmrun('directoryExistsInGuest', [vmxFile, validPath(path)])
        .then(function (std) {

            return std.stdout.indexOf('directory exists') > -1;
        });
};

/**
 * @param {String} vmxFile
 * @param {String} shareName
 * @param {String} hostPath
 * @param {Boolean?} writable=true
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.setSharedFolderState = function (vmxFile, shareName, hostPath, writable) {
    return this
        .vmrun('setSharedFolderState', [
            vmxFile,
            shareName,
            hostPath,
            (writable || writable === undefined) ? 'writable' : 'readonly'
        ]);
};

/**
 * @param {String} vmxFile
 * @param {String} shareName
 * @param {String} newHostPath
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.addSharedFolder = function (vmxFile, shareName, newHostPath) {
    return this.vmrun('addSharedFolder', [vmxFile, shareName, newHostPath]);
};

/**
 * @param {String} vmxFile
 * @param {String} shareName
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.removeSharedFolder = function (vmxFile, shareName) {
    return this.vmrun('removeSharedFolder', [vmxFile, shareName]);
};

/**
 * @param {String} vmxFile
 * @param {Boolean} runtime=false
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.enableSharedFolders = function (vmxFile, runtime) {
    var args = [vmxFile];
    if (runtime) {
        args.push('runtime');
    }
    return this.vmrun('enableSharedFolders', args);
};

/**
 * @param {String} vmxFile
 * @param {Boolean} runtime=false
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.disableSharedFolders = function (vmxFile, runtime) {
    var args = [vmxFile];
    if (runtime) {
        args.push('runtime');
    }
    return this.vmrun('disableSharedFolders', args);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<[{pid, owner, cmd}]>}
 */
VMRun.prototype.listProcessesInGuest = function (vmxFile) {
    return this.vmrun('listProcessesInGuest', [vmxFile])
        .then(function (std) {

            var idx = std.stdout.indexOf('Process list');
            if (idx > -1) {
                idx = std.stdout.indexOf('\n', idx);
            }

            var list = std.stdout.substr(idx).trim().split('\n');
            idx = list.indexOf('');
            if (idx > -1) {
                list.splice(idx, 1);
            }

            var processes = [];

            list.forEach(function (x) {
                var matches = x.match(/^pid=([0-9]+), owner=(.*?), cmd=(.*)$/);
                if (matches) {
                    processes.push({
                        pid: matches[1]
                        , owner: matches[2]
                        , cmd: matches[3]
                    });
                }
            });

            return processes;
        });
};

/**
 * @param {String} vmxFile
 * @param {String|Number} processId
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.killProcessInGuest = function (vmxFile, processId) {
    return this.vmrun('killProcessInGuest', [vmxFile, processId]);
};

/**
 * @param {String} vmxFile
 * @param {String} interpreterPath
 * @param {String} script
 * @param {Object?} options
 * @param {Boolean} options.noWait=false
 * @param {Boolean} options.activeWindow=false
 * @param {Boolean} options.interactive=false
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.runScriptInGuest = function (vmxFile, interpreterPath, script, options) {
    var args = [vmxFile];
    if (options) {
        if (options.noWait) {
            args.push('-noWait');
        }
        if (options.activeWindow) {
            args.push('-activeWindow');
        }
        if (options.interactive) {
            args.push('-interactive');
        }
    }
    args.push(interpreterPath);
    args.push(script);

    return this.vmrun('runScriptInGuest', args);
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.deleteFileInGuest = function (vmxFile, path) {
    return this.vmrun('deleteFileInGuest', [vmxFile, validPath(path)]);
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.createDirectoryInGuest = function (vmxFile, path) {
    return this.vmrun('createDirectoryInGuest', [vmxFile, validPath(path)]);
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.deleteDirectoryInGuest = function (vmxFile, path) {
    return this.vmrun('deleteDirectoryInGuest', [vmxFile, validPath(path)]);
};

/**
 * @param {String} vmxFile
 * @param {String} path
 * @returns {Promise.<String>}
 */
VMRun.prototype.createTempfileInGuest = function (vmxFile) {
    return this.vmrun('createTempfileInGuest', [vmxFile])
        .then(function (std) {
            if (std.stdout) {
                return cleanStdout(std.stdout);
            }

            throw new Error(std.stderr);
        });
};

/**
 * @param {String} vmxFile
 * @param {String} directoryPath
 * @returns {Promise.<[String]>}
 */
VMRun.prototype.listDirectoryInGuest = function (vmxFile, directoryPath) {

    directoryPath = (directoryPath + '').replace(/[\/\\]*$/, '');

    return this.vmrun('listDirectoryInGuest', [vmxFile, validPath(directoryPath)])
        .then(function (std) {

            var idx = std.stdout.indexOf('Directory list');
            if (idx > -1) {
                idx = std.stdout.indexOf('\n', idx);
            }

            var list = std.stdout.substr(idx).trim().split('\n');
            idx = list.indexOf('');
            if (idx > -1) {
                list.splice(idx, 1);
            }

            return list;
        });
};

/**
 * @param {String} vmxFile
 * @param {String} pathInHost
 * @param {String} pathInGuest
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.copyFileFromHostToGuest = function (vmxFile, pathInHost, pathInGuest) {
    return this.vmrun('copyFileFromHostToGuest', [vmxFile, validPath(pathInHost), validPath(pathInGuest)]);
};

/**
 * @param {String} vmxFile
 * @param {String} pathInGuest
 * @param {String} pathInHost
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.copyFileFromGuestToHost = function (vmxFile, pathInGuest, pathInHost) {
    return this.vmrun('copyFileFromGuestToHost', [vmxFile, validPath(pathInGuest), validPath(pathInHost)]);
};

/**
 * @param {String} vmxFile
 * @param {String} originalName
 * @param {String} newName
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.renameFileInGuest = function (vmxFile, originalName, newName) {
    return this.vmrun('renameFileInGuest', [vmxFile, validPath(originalName), validPath(newName)]);
};

/**
 * @param {String} vmxFile
 * @param {String} pathOnHost
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.captureScreen = function (vmxFile, pathOnHost) {
    return this.vmrun('captureScreen', [vmxFile, validPath(pathOnHost)]);
};

/**
 * @param {String} vmxFile
 * @param {String?} where 'runtimeConfig' | 'guestEnv' | 'guestVar'
 * @param {String|Number} variableName
 * @param {String|Number} variableValue
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.writeVariable = function (vmxFile, where, variableName, variableValue) {
    var args = [vmxFile];
    if (where) {
        args.push(where);
    }
    args.push(variableName, variableValue);

    return this.vmrun('writeVariable', args);
};

/**
 * @param {String} vmxFile
 * @param {String?} where 'runtimeConfig' | 'guestEnv' | 'guestVar'
 * @param {String|Number} variableName
 * @returns {Promise.<String>}
 */
VMRun.prototype.readVariable = function (vmxFile, where, variableName) {
    var args = [vmxFile];
    if (where) {
        args.push(where);
    }
    args.push(variableName);

    return this.vmrun('readVariable', args)
        .then(function (std) {
            if (std.stderr) {
                throw new Error(std.stderr);
            }
            return cleanStdout(std.stdout);
        });
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<String>}
 */
VMRun.prototype.getGuestIPAddress = function (vmxFile) {
    return this.vmrun('getGuestIPAddress', [vmxFile])
        .then(function (std) {
            if (std.stderr) {
                throw new Error(std.stderr);
            }
            return cleanStdout(std.stdout);
        });
};

/**
 * @returns {Promise.<[String]>}
 */
VMRun.prototype.list = function () {

    return this.vmrun('list')
        .then(function (std) {

            var idx = std.stdout.indexOf('Total ');
            if (idx > -1) {
                idx = std.stdout.indexOf('\n', idx);
            }

            var list = std.stdout.substr(idx).trim().split('\n');
            idx = list.indexOf('');
            if (idx > -1) {
                list.splice(idx, 1);
            }

            return list;
        });
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.upgradeVM = function (vmxFile) {
    return this.vmrun('upgradevm', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.installTools = function (vmxFile) {
    return this.vmrun('installTools', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<String>}
 */
VMRun.prototype.checkToolsState = function (vmxFile) {
    return this.vmrun('checkToolsState', [vmxFile])
        .then(function (std) {
            if (std.stderr) {
                throw new Error(std.stderr);
            }
            return cleanStdout(std.stdout);
        });
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.register = function (vmxFile) {
    return this.vmrun('register', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.unregister = function (vmxFile) {
    return this.vmrun('unregister', [vmxFile]);
};

/**
 * @param {String} directoryPath
 * @returns {Promise.<[String]>}
 */
VMRun.prototype.listRegisteredVM = function () {

    return this.vmrun('listRegisteredVM')
        .then(function (std) {

            var idx = std.stdout.indexOf('Total ');
            if (idx > -1) {
                idx = std.stdout.indexOf('\n', idx);
            }

            var list = std.stdout.substr(idx).trim().split('\n');
            idx = list.indexOf('');
            if (idx > -1) {
                list.splice(idx, 1);
            }

            return list;
        });
};

/**
 * @param {String} vmxFile
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.deleteVM = function (vmxFile) {
    return this.vmrun('deleteVM', [vmxFile]);
};

/**
 * @param {String} vmxFile
 * @param {String} newVmxFile
 * @param {String} type='linked' 'full' | 'linked'
 * @param {String?} snapshotName
 * @param {String?} cloneName
 * @returns {Promise.<{stdout, stderr}>}
 */
VMRun.prototype.clone = function (vmxFile, newVmxFile, type, snapshotName, cloneName) {
    var args = [vmxFile, newVmxFile];
    args.push(type === 'full' ? 'full' : 'linked');
    if (snapshotName) {
        args.push('-snapshot=' + snapshotName);
    }
    if (cloneName) {
        args.push('-cloneName=' + cloneName);
    }
    return this.vmrun('clone', args);
};

/**
 * @type {VMRun}
 */
module.exports = new VMRun();
