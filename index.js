/**
 * Created by zack-lin on 14-12-15.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');
var spawn = child_process.spawn;
var mkdirp = require('mkdirp');
var log4js = require('log4js');

function dir() {
    var dirPath = path.join.apply(path, arguments);
    mkdirp.sync(dirPath);
    return dirPath;
};

exports.name = 'checklog';
exports.usage = '[options]';
exports.desc = 'check log data';
exports.register = function(commander) {

    function touch(dir){
        if(fis.util.exists(dir)){
            if(!fis.util.isDir(dir)){
                fis.log.error('invalid directory [' + dir + ']');
            }
        } else {
            fis.util.mkdir(dir);
        }
        return fis.util.realpath(dir);
    }

    var root = touch((function(){
        var key = 'FIS_SERVER_DOCUMENT_ROOT';
        if(process.env && process.env[key]){
            var path = process.env[key];
            if(fis.util.exists(path) && !fis.util.isDir(path)){
                fis.log.error('invalid environment variable [' + key + '] of document root [' + path + ']');
            }
            return path;
        } else {
            return fis.project.getTempPath('www');
        }
    })());

    var logger = getLogger();

    function readLogsAndTest(casesPath, logsPath) {
        var input = fs.createReadStream(logsPath);
        getAllFiles(casesPath).forEach(function(item){
            requireAsync(item, function(err, module){
                if(typeof module.exports === 'function') {
                    var pass = 0;
                    readLines(input, function(data){
                        
                        if(data) {
                            var params = {};
                            data = data.replace('\r', '').split('`');
                            data.forEach(function(param){
                                if(param) {
                                    param = param.split('=');
                                    params[param[0]] = param[1];
                                }
                            });
                            var result = module.exports(params);
                            if(result && !result.pass && result.message) {
                                logger.info('-----------------------------------------');
                                console.log('\n-----------------------------------------');
                                logger.info(' LOG ID   : tm = ' + params._tm);
                                console.log(' LOG ID   : tm = %s', params._tm);
                                logger.info(' 用例     : ' + item);
                                console.log(' 用例     : %s', item);
                                logger.info(' 检查结果 : ' + result.message.join(', '));
                                console.log(' 检查结果 : %s', result.message.join(', '));
                                logger.info('-----------------------------------------');
                                console.log('-----------------------------------------');
                            } else if(result.pass){
                                pass++;
                            }
                        }
                    }, function(total){
                        console.log('pass : %s, fail : %s, total : %s, pass rate : %s', pass, total - pass, total, parseInt(pass / total * 100) + '%'); 
                        logger.info('pass : ' + pass + ', fail : ' + (total - pass) + ', total : ' + total + ', pass rate : ' + (parseInt(pass / total * 100) + '%'));
                    });
                }
            });
        });
    }

     function getLogger() {
        var logDir = path.join(root, 'private/results');

        dir(logDir);
        log4js.loadAppender('dateFile');
        log4js.clearAppenders();
        log4js.addAppender(log4js.appenderMakers.dateFile({
            filename: 'result',
            pattern:  '_yyyyMMddhh.log',
            alwaysIncludePattern: true,
            layout: {
                type: 'pattern',
                pattern: '%x{data}',
                tokens: {data: function (e) {
                    var line;
                    e.data.forEach(function (d) {
                        line = d;
                    });
                    return line;
                }}
            }
        }, {
            cwd: logDir
        }), 'results');
        var _logger = log4js.getLogger('results');
        _logger.setLevel('info');

        return _logger;
    }

    function readLines(input, func1, func2) {
        var remaining = '';
        var total = 0;

        input.on('data', function(data) {
            remaining += data;
            var index = remaining.indexOf('\n');
            var last  = 0;
            while (index > -1) {
                var line = remaining.substring(last, index);
                last = index + 1;
                total ++;
                func1(line);
                index = remaining.indexOf('\n', last);
            }

            remaining = remaining.substring(last);
        });

        input.on('end', function() {
            if (remaining.length > 0) {
                func(remaining);
            }
            func2(total);
        });
    }

    function getAllFiles(rootPath){

        var res = [] , files = fs.readdirSync(rootPath);
        files.forEach(function(file){
            var pathname = path.join(rootPath, file)
            , stat = fs.lstatSync(pathname);

            if (!stat.isDirectory()){
                res.push(pathname.replace(path.join(root),'.'));
            } else {
                res = res.concat(getAllFiles(pathname));
            }
        });
        return res;
    }

    var requireAsync = function (module, callback) {
      fs.readFile(module, { encoding: 'utf8' }, function (err, data) {
        var module = {
          exports: {}
        };
        var code = '(function (module) {' + data + '})(module)';
        eval(code);
        callback(null, module);
      });
    };

    commander
        .option('-c, --cases <path>', 'test cases')
        .option('-l, --logs <path>', 'test log  data')
        .action(function(){
            var args = Array.prototype.slice.call(arguments);
            var opt = args.pop();
            var cmd = args.shift();
            if(root){
                if(fis.util.exists(root) && !fis.util.isDir(root)){
                    fis.log.error('invalid document root [' + root + ']');
                } else {
                    fis.util.mkdir(root);
                }
            } else {
                fis.log.error('missing document root');
            }

            var casesPath, logsPath;
            if(opt.cases){
                casesPath = path.join(root, opt.cases);
                if(fis.util.exists(casesPath)){
                    delete opt.cases;
                }else {
                    casesPath = null;
                    fis.log.error('invalid cases path [' + casesPath + ']');
                }
            } 

            if(opt.logs){
                logsPath = path.join(root, opt.logs);
                if(fis.util.exists(logsPath) && !fis.util.isDir(logsPath)){
                    delete opt.logsPath;
                }else {
                    logsPath = null;
                    fis.log.error('invalid logs path [' + logsPath + ']');
                }
            } 

            if(casesPath && logsPath) {
                readLogsAndTest(casesPath, logsPath);
            }
        });
};