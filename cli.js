#!/usr/bin/env node

'use strict';

require('colors');

var os = require('os'),
    fs = require('fs'),
    ncp = require('ncp').ncp,
    readline = require('readline'),
    exec = require('child_process').exec,
    async = require('async');

var isWin = !!process.platform.match(/^win/);

ncp.limit = 16;

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var nodePar = '--stack-trace-limit=1000 --allow-natives-syntax --max_old_space_size=2048',
    linkFileName = __dirname + '/impress.link',
    existsLink = fs.existsSync(linkFileName),
    impressPath = existsLink ? fs.readFileSync(linkFileName, 'utf8') : '/impress',
    applicationsDir = impressPath + '/applications',
    curDir = process.cwd(),
    commandName, command,
    parameters = process.argv;

var pkgPlace = impressPath + '/node_modules/impress/package.json',
    pkgExists = fs.existsSync(pkgPlace),
    pkgData;

if (!pkgExists) {
  pkgPlace = impressPath + 'package.json';
  pkgExists = fs.existsSync(pkgPlace);
}

if (pkgExists) {
  try {
    pkgData = require(pkgPlace);
  } catch(err) {}
} else pkgData = { version: '' };

global.applications = [];

// Execute shell command displaying output and possible errors
//
function execute(cmd, callback) {
  exec(cmd, { cwd: __dirname }, function(error, stdout /* stderr */) {
    if (error) console.log(error.toString());
    else console.log(stdout);
    if (callback) callback();
  });
}

// Release readline on exit
//
function doExit() {
  rl.close();
  process.chdir(curDir);
  process.exit(0);
}

// Command line commands list
//
function showHelp() {
  console.log(
    'Syntax:\n' +
    '  impress path <path>\n' +
    '  impress start\n' +
    '  impress stop [-f|--force]\n' +
    '  impress restart\n' +
    '  impress status\n' +
    '  impress version\n' +
    '  impress update\n' +
    '  impress autostart [on|off]\n' +
    '  impress list\n' +
    '  impress add [path]\n' +
    '  impress remove [name]\n' +
    '  impress new [name]'
  );
  doExit();
}

// Command line commands
//
var commands = {

  // impress list
  //
  list: function() {
    console.log('  Applications: ');
    var i;
    for (i = 0; i < applications.length; i++) {
      console.log('    ' + applications[i].green.bold);
    }
    doExit();
  },

  // impress add [path]
  //
  add: function() {

    function doInput() {
      rl.question('Enter application name: ', function(answer) {
        if (applications.indexOf(answer) === -1) {
          applicationName = answer;
          doAdd();
          doExit();
        } else {
          console.log('Application "' + answer + '" already exists');
          doInput();
        }
      });
    }

    function doAdd() {
      var applicationPath = applicationsDir + '/' + applicationName,
          applicationLink = applicationPath + '/' + 'application.link';
      fs.mkdirSync(applicationPath);
      fs.writeFileSync(applicationLink, curDir);
      console.log('Application "' + applicationName + '" added with link to: ' + curDir);
      doExit();
    }

    var applicationName = parameters[1];
    if (applicationName) doAdd(); else doInput();

  },

  // impress remove [name]
  //
  remove: function() {
    console.log('Not implemented');
    doExit();
  },

  // impress new [name]
  //
  new: function() {
    console.log('Not implemented');
    doExit();
  },

  // impress start
  //
  start: function() {
    if (isWin) execute('start cmd /K "cd /d ' + impressPath.replace(/\//g, '\\') + ' & node ' + nodePar + ' server.js"', doExit);
    else {
      var command = 'cd ' + impressPath + '; nohup node ' + nodePar +
                    ' server.js > /dev/null 2>&1 & echo $! > ' + __dirname + '/run.pid';
      execute(command, function() {
        setTimeout(function() {
          checkStarted(finalize);
        }, 2000);
      });

      function checkStarted(callback) {
        fs.readFile('./run.pid', function(err, pid) {
          if (err) {
            startFailed();
            return callback();
          }

          exec('kill -0 ' + pid, function(err) {
            if (err) {
              startFailed();
            }

            callback();
          });
        });
      }

      function startFailed() {
        console.log('Failed to start Impress Application Server'.bold.red);
        console.log(('See logs in ' + impressPath + '/log/ for details').bold.red);
      }

      function finalize() {
        fs.unlink('./run.pid');
        doExit();
      }
    }
  },
        
  // impress stop
  //
  stop: function() {
    var force = false;
    if (['-f', '--force'].indexOf(parameters[1]) !== -1) {
      force = true;
    }

    if (isWin) {
      console.log('Not implemented');
      doExit();
    } else {
      exec('ps -A | awk \'{if ($4 == "impress") print $1, $5}\'',
        function(err, stdout, stderr) {
          var error = err || stderr;
          if (error) {
            console.log(error.toString().red.bold);
            doExit();
          }

          var processes = stdout.toString().split('\n').filter(function(line) {
            return line !== '';
          }).map(function(line) {
            var parsedLine = line.split(' ');
            return { pid: parsedLine[0], workerId: parsedLine[1] };
          }).sort(function(first, second) {
            if (first.workerId  === 'srv') return -1;
            if (second.workerId === 'srv') return 1;
            return 0;
          });

          async.eachSeries(processes, function(worker, callback) {
            var command = 'kill ';
            if (force) command += '-9 ';
            execute(command + worker.pid, callback);
          }, function(err) {
            if (err) console.log(err.toString().red.bold);
            else console.log('Stopped');
            doExit();
          });
        });
    }
  },

  // impress restart
  //
  restart: function() {
    if (isWin) {
      console.log('Not implemented');
      doExit();
    } else execute('killall "impress srv"', commands.start);
  },

  // impress status
  //
  status: function() {
    if (isWin) {
      console.log('Not implemented');
      doExit();
    } else execute('ps aux | grep "impress\\|%CPU" | grep -v "grep\\|status"', function() {
      console.log('Stopped');
      doExit();
    });
  },

  // impress version
  //
  version: function() {
    console.log(
      ' Impress AS: ' + pkgData.version + '\n' +
      '    Node.js: ' + process.versions['node'] + '\n' +
      '         v8: ' + process.versions['v8'] + '\n' +
      '      libuv: ' + process.versions['uv'] + '\n' +
      '       zlib: ' + process.versions['zlib'] + '\n' +
      '   Open SSL: ' + process.versions['openssl'] + '\n' +
      'HTTP parser: ' + process.versions['http_parser'] + '\n' +
      '         OS: ' + os.type() + ' ' + os.release() + ' ' + os.arch()
    );
    doExit();
  },

  // impress update
  //
  update: function() {
    if (isWin) {
      console.log('Not implemented');
      doExit();
    } else execute('npm update -g impress-cli; cd ' + impressPath + '; npm update', doExit);
  },

  // impress autostart
  //
  autostart: function() {
    if (isWin) {
      console.log('Not implemented');
      doExit();
    } else {
      if (parameters[1] === 'on') {
        execute('./bin/install.sh', function() {
          console.log('Installed to autostart on system boot');
          doExit();
        });
      } else if (parameters[1] === 'off') {
        execute('./bin/uninstall.sh', function() {
          console.log('Uninstalled from autostart on system boot');
          doExit();
        });
      } else showHelp();
    }
  },

  // impress autostart
  //
  path: function() {
    if (parameters[1]) {
      impressPath = parameters[1];
      fs.writeFileSync('./impress.link', impressPath);
    }
    console.log('  Path: ' + impressPath.green.bold);
    doExit();
  }

};

console.log(('Impress Application Server ' + pkgData.version).green.bold);
process.chdir(__dirname);

// Parse command line
//
if (parameters.length < 3) showHelp();
else {
  if (fs.existsSync(applicationsDir)) applications = fs.readdirSync(applicationsDir);
  parameters.shift();
  parameters.shift();
  commandName = parameters[0];
  command = commands[commandName];
  if (!command) showHelp();
  else command();
}
