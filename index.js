/**
 * Created by zack-lin on 14-12-15.
 */

'use strict';

var path = require('path');
var fs = require('fs');
var child_process = require('child_process');
var spawn = child_process.spawn;
var _ = require('underscore');
var csvWriter = require('csv-write-stream');

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

    var resultPath = path.join(root, 'private/results/report-' + Date.now() + '.csv');

    
    var t;
    function readLogsAndTest(confPathname, logsPath) {
        t = +Date.now();
        var input = fs.createReadStream(logsPath);
        var type = logsPath.indexOf('click') >= 0 ? 'click' : 'pageview';
        
        requireAsync(confPathname, function(err, module){
            var filters = module.filters && module.filters[type] ? module.filters[type] : null;
            var replaceFn = module.replaceFn && module.replaceFn[type] ? module.replaceFn[type] : null;
            var uniqFn = module.uniqFn && module.uniqFn[type] ? module.uniqFn[type] : null;
            if(filters) {
                var totalData = {};
                if (typeof filters === 'string') {
                    filters = filters.split(' ');
                }

                readLines(input, function(data){
                    if(data) {
                        var params = {};
                        //参数分割 耗时较长
                        data = data.replace('\r', '');
                        data = data.split('`');
                        data.forEach(function(param){
                            if(param && param.indexOf('=')>=1) {
                                var _key = param.substring(0, param.indexOf('='));
                                if(filters.indexOf(_key)>=0) {
                                    var val = param.replace(_key + '=', '');
                                    params[_key] = val;
                                }
                            }
                        });
                        //替换参数值
                        var params = replaceFn ? replaceFn(params) : params, rsl = [];
                        //过滤参数
                        filters.forEach(function(o){
                            rsl.push(params[o] || '');
                        });
                        //获取结果字符串序列号为 key 值做 hash 排重，这里不能用 md5 ，会发生内存泄露
                        var key = JSON.stringify(rsl);
                        totalData[key] = params;
                    }
                }, function(total){
                    var rsl = _.values(totalData);
                    //矩阵数组排重
                    rsl = uniqFn ? uniqFn(rsl) : rsl;
                    
                    var writer = csvWriter({ headers: filters});
                    writer.pipe(fs.createWriteStream(resultPath));
                   
                    rsl.forEach(function(item){
                        //按照过滤顺序输出
                        var tmp = [];
                        filters.forEach(function(o){
                            tmp.push(item[o]);
                        });
                        writer.write(tmp);
                    });
                    writer.end();
                    
                    var n = +Date.now();
                    console.log('%s 总耗时 %sms', logsPath.substring(logsPath.lastIndexOf('\\') + 1, logsPath.length), n - t);
                });
            }
        });
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

    function requireAsync(module, callback) {
      fs.readFile(module, { encoding: 'utf8' }, function (err, data) {
        var module = {
          exports: {}
        };
        var code = '(function (module) {' + data + '})(module)';
        eval(code);
        callback(null, module.exports);
      });
    };

    commander
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

            var confPathname = './checklog-conf.js';
            var pathname = path.join(root, confPathname);
            if(!fis.util.exists(pathname) || fis.util.isDir(pathname)){
                fis.log.error('invalid checklog-conf path [' + confPathname + ']');
            }

            var logsPath;
            if(opt.logs){
                logsPath = path.join(root, opt.logs);
                if(fis.util.exists(logsPath) && !fis.util.isDir(logsPath)){
                    readLogsAndTest(pathname, logsPath);
                }else {
                    fis.log.error('invalid logs path [' + logsPath + ']');
                }
            }
        });
};