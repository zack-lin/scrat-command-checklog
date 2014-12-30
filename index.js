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
require('events').EventEmitter.prototype._maxListeners = 100;

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
        var pass = {}, total = {}, msg = {};
        getAllFiles(casesPath).forEach(function(item, index){
            requireAsync(item, function(err, module){
                if(typeof module.exports === 'function') {
                    pass[item] = pass[item] || 0;
                    total[item] = total[item] || 0;
                    readLines(input, function(data){
                        if(data) {
                            var params = {};
                            data = data.replace('\r', '').split('`');
                            data.forEach(function(param){
                                if(param && param.indexOf('=')>=1) {
                                    var key = param.substring(0, param.indexOf('='));
                                    var val = param.replace(key + '=', '');
                                    params[key] = val;
                                }
                            });
                            var result = module.exports(params);
                            if(result && !result.pass && result.message) {
                                msg[item] = msg[item] || [];
                                msg[item].push({
                                    _tm: params._tm,
                                    result: result.message.join(', ')
                                });
                                
                                total[item]++;
                            } else if(result && result.pass){
                                pass[item]++;
                                total[item]++;
                            }
                        }

                    }, function(count){
                        console.log('\n%s. 用例 %s', index + 1, item);
                        logger.info('\n' + (index + 1) + '. 用例 ' + item);

                        var _msg = msg[item];
                        if(_msg && _msg.length > 0) {
                            _msg.forEach(function(o){
                                logger.info(' LOG ID   : tm = ' + o._tm);
                                console.log(' LOG ID   : tm = %s', o._tm);
                                logger.info(' 用例     : ' + item);
                                console.log(' 用例     : %s', item);
                                logger.info(' 检查结果 : ' + o.result);
                                console.log(' 检查结果 : %s', o.result);
                            });
                        }
                        
                        var passRate = pass[item] / total[item] || 0;
                        var hitRate = total[item] / count || 0;
                        
                        console.log('pass : %s, fail : %s, hit : %s, total : %s, pass rate : %s, hit rate : %s', pass[item], total[item] - pass[item], total[item], count, parseInt(passRate * 100) + '%', parseInt(hitRate * 100) + '%'); 
                        logger.info('pass : ' + pass[item] + ', fail : ' + (total[item] - pass[item]) + ', total : ' + total[item] + ', pass rate : ' + (parseInt(passRate * 100) + '%') + ', hit rate : ' + (parseInt(hitRate * 100) + '%'));
                        logger.info('--------------------------------------------------------------------------');
                        console.log('--------------------------------------------------------------------------');
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

        input.on('end', function(data) {
            if (remaining.length > 0) {
                total ++;
                func1(remaining);
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