var path = require('path');                                     // Node Path functions
var gulp = require('gulp');                                     // The Gulp! Environment
var fork = require('child_process').fork;                       // Node process forking
var fs = require('fs');                                         // Node File stream

var concat = require('gulp-concat');                            // Concating files into an App

/* Really usful */
var stylish = require('jshint-stylish');                        // A better JSHint styling for reports
var debug = require('gulp-debug');                              // Debugging messages inside Gukp! pipes
var using = require('gulp-using');                              // What file is being used in a pipe
var clean = require('gulp-clean');                              // Remove folders and files

// include plug-ins
var jsonextend = require('gulp-extend');                        // Combine json files onto single output
var browserify = require('gulp-browserify');                    // Adds Maps to JS files
var minifyHtml = require('gulp-minify-html');                   // minify HTML file contents
var connect = require('gulp-connect');                          // Refresh when output content chnages
var changed = require('gulp-changed');                          // Only process chnaged files in pipe
var filter = require('gulp-filter');                            // Filterinhg of file streams
var gulpif = require('gulp-if');                                // Conditional pipes
var ignore = require('gulp-ignore');                            // Stop processing file streams
var jshint = require('gulp-jshint');                            // Parse JS files and report errors
var minify = require('gulp-minify-css');                        // minify CSS contents
var rename = require('gulp-rename');                            // Renaming files at destination
var uglify = require('gulp-uglify');                            // minify JS contents
var gutil = require('gulp-util');                               // log and noop utilities
var shell = require('gulp-shell');                              // call out to command shell
var sass = require('gulp-sass');                                // Convert SCSS to CSS files
var es = require('event-stream');                               // Getting at streams / pipes

// testing & coverage
var plugins = require('gulp-load-plugins')({ lazy: false });    // auto scan and Load plugins required
var tinyLr = require('tiny-lr');                                // tiny livereload
var mocha = require('gulp-mocha');                              // Mocha testing / reporting
var async = require('async');                                   // Async tools

// ** App Variables **
var buildDir = 'build';
var website =   buildDir; //path.join(buildDir, "website");
var testDir = path.join(website, "tests");
var publicDir = path.join(website, "public");

var lr = null;
var lrPort = 35729;
var env = process.env.MODE_ENV || 'development';
var appFile = path.join( website, 'server.js');
var configFile = path.join( website, 'app_start', 'config.json');


// ====================================
// Utility Function for getting folders
// ====================================
function getFolders(dir)
{
    return fs.readdirSync(dir).filter
    (
        function(file)
        {
            return fs.statSync(path.join(dir, file)).isDirectory();
        }
    );
}

function extend(target) 
{
    var sources = [].slice.call(arguments, 1);
    
    sources.forEach(function (source) 
    {
        for (var prop in source) {
            target[prop] = source[prop];
        }
    });
    
    return target;
}

// ====================================
//        Stop and Start Node App
// ====================================
var app = {

    start: function(callback) {
            
        process.execArgv.push('--debug');
        
        var instance = app.instance = fork (appFile, { silent: false });

        app.dataListener = function(data) {

            var message = '' + data;
            // Assume that server is started when it prints the following to stdout
            if (message.indexOf('Express server listening on port') === 0) {
                callback();
            }
        };

        if ( instance.stdout ) {
            instance.stdout.on('data', app.dataListener);
            instance.stdout.pipe(process.stdout);
        }

        if ( instance.stderr ) {
            instance.stderr.pipe(process.stderr);
        }
    },

    stop: function(callback) {

        if ( app.instance.stdout )
            app.instance.stdout.removeListener('data', app.dataListener);

        plugins.util.log('Killing Express server with PID', app.instance.pid);
        app.instance.kill('SIGTERM');
        callback();
    }
};

// ====================================
// Support function to make SLL files
// ====================================
gulp.task('create:ssl', function() 
{

    var fs = require('fs');
    fs.exists('src/addins', function(exists) 
    {
        if (exists) 
        {
            gulp.src('src/addins/*.pem')
                .pipe(clean({force: true}));
        } 
        else 
        {
            gulp.src('')
                .pipe(shell([
                    '(cd src && md addins)'
                ]));
        }

        gulp.src('')
            .pipe(shell([
                '(cd src && cd addins && cd website && openssl genrsa -out sslkey.pem 1024)',
                '(cd src && cd addins && cd website && openssl req -new -key sslkey.pem -days 1000 -out certrequest.csr -subj "/C=GB/ST=Dev/L=Local/O=Dev/CN=www.localhost.com")',
                '(cd src && cd addins && cd website && openssl x509 -req -in certrequest.csr -signkey sslkey.pem -out sslcert.pem)',
                '(cd src && cd addins && cd website && del certrequest.csr)'
            ]))
            .on('error', gutil.log);
    });
}); 

// ====================================
//                 INIT
// ====================================

// init: removes everything from 'build' folder
gulp.task('init:clean', function() 
{
    return gulp.src(['build', 'bower_components', 'coverage'])
               .pipe(using({}))
               .pipe(clean({force: true}))
               .on('error', gutil.log);
});

// Init: install bower packages - these won't be checked into Git
gulp.task('init:bower-install', function() 
{

    return gulp.src('')
               .pipe(shell([ '(bower install)' ]))
               .on('error', gutil.log);
});

// ====================================
//                 SERVER
// ====================================
gulp.task('server-js', function() {

    var dest = website;

    return gulp.src('src/server/**/*.js' )
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(gulp.dest(dest))
               .on('error', gutil.log);
});

gulp.task('server-services-js', function() {

    var dest = path.join(website, "services");

    // exclude all files processed by 'client-js' and 'client-angular-js' task
    return gulp.src(['src/services/**/*.js']) 
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('server-addins', function() {

    var dest = website;

    /* For some reason *.* does not copy git files */
    return gulp.src(['src/addins/website/.gitattributes', 
                     'src/addins/website/.gitignore' ,
                     'src/addins/website/iisnode.yml',
                     'src/addins/website/package.json',
                     'src/addins/website/*.pem',
                     'src/addins/website//README.md'])
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(gulp.dest(dest))
               .on('error', gutil.log);
});

gulp.task('server-config', function() {

    var dest = path.join(website, 'app_start');

    var files = ['src/server/app_start/env/default.json'];

    var build = gutil.env.env ? gutil.env.env : env;

    // Build appropiate list for the environment we're in
    switch( build )
    {
        case 'test':
        case 'travis':
            files.push('src/server/app_start/env/testing.json');
            break;
        case 'production':
            files.push('src/server/app_start/env/production.json');
            break;
        default:
            files.push('src/server/app_start/env/development.json');
            files.push('src/server/app_start/env/override.json');
            break;
    }

    return gulp.src(files)
               .pipe(using({}))
               .pipe(jsonextend("config.json")).on('error', gutil.log)
               .pipe(gulp.dest(dest));
});

gulp.task('server-npm', ['server-addins'], function() 
{
    return gulp.src('')
               .pipe(shell([
                      '(cd build && npm install)',
               ]))
               .on('error', gutil.log);
}); 


// ====================================
//                CLIENT
// ====================================
gulp.task('client-js', function() 
{
    var dest = path.join(publicDir, 'js');

    // Need these files to load in a very particular order
    return gulp.src([ 'src/client/app/appSecurity.js',
                      'src/client/app/app.js',
                      'src/client/app/config.js',
                      'src/client/app/config.route.js',
                      'src/client/app/config.exceptionHandler.js',
                      'src/client/app/loginController.js',
                      'src/client/app/appController.js' ])
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(concat('app.js')).on('error', gutil.log)
               //.pipe(browserify({ debug: env === 'development' })).on('error', gutil.log)
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulpif(env === 'production', rename('app.min.js')))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-angular-js', function() 
{
    var dest = path.join(publicDir, 'js');

    return gulp.src([ 'src/client/app/modules/common.js',
                      'src/client/app/modules/logger.js',
                      'src/client/app/modules/spinner.js',
                      'src/client/app/services/directives.js',
                      'src/client/app/services/datacontext.js',
                      'src/client/app/services/filters.js' ])
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(concat('app.modules.js')).on('error', gutil.log)
               //.pipe(browserify({ debug: env === 'development' })).on('error', gutil.log)
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulpif(env === 'production', rename('app.modules.min.js')))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-app-js', function() 
{
    var dest = path.join(publicDir, 'js');

    // exclude all files processed by 'client-js' and 'client-angular-js' task
    return gulp.src([ 'src/client/app/**/*.js', 
                      '!src/client/app/*.js', 
                      '!src/client/app/modules/*.js', 
                      '!src/client/app/services/*.js']) 
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(concat('app.support.js')).on('error', gutil.log)
               //.pipe(browserify({ debug: env === 'development' })).on('error', gutil.log)
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulpif(env === 'production', rename('app.support.min.js')))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-polyfill-js', function() 
{
    var dest = path.join(publicDir, 'js');

    // exclude all files processed by 'client-js' and 'client-angular-js' task
    return gulp.src(['src/client/polyfills/*.js']) 
               .pipe(using({}))
               .pipe(gulpif(env !== 'production', jshint() ))
               .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
               .pipe(gulpif(env === 'test', jshint.reporter('default') ))
               .pipe(concat('app.polyfill.js')).on('error', gutil.log)
               //.pipe(browserify({ debug: env === 'development' })).on('error', gutil.log)
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulpif(env === 'production', rename('app.polyfill.min.js')))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});


gulp.task('client-views', function() 
{
    var dest = path.join(publicDir);

    return gulp.src(['src/client/**/*.html', 'src/client/*.ico' ])
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload())
               .on('error', gutil.log);
});

gulp.task('client-library', ['init:bower-install'], function() {

    var dest = path.join(publicDir, 'js');

    return gulp.src([ 'bower_components/jquery/dist/jquery.js',
                      'bower_components/lodash/dist/lodash.js',
                      'bower_components/angular/angular.js',
                      'bower_components/angular-route/angular-route.js',
                      'bower_components/angular-animate/angular-animate.js',
                      'bower_components/angular-sanitize/angular-sanitize.js',
                      'bower_components/angular-google-maps/dist/angular-google-maps.js',
                      'bower_components/bootstrap/dist/bootstrap.js',
                      'bower_components/moment/moment.js',
                      'bower_components/toastr/toastr.js',
                      'bower_components/spin.js/spin.js' ])
               .pipe(concat('lib.js'))
               .on('error', gutil.log)
               .pipe(gulpif(env === 'production', uglify() ))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-lib-styles', ['init:bower-install'], function() 
{
    var config = {
        precision : 4,
        outputStyle: 'nested'
    };

    var dest =  path.join(publicDir, 'css');

    if (env === 'production') 
    {
        config.outputStyle = 'compressed';
    }

    return gulp.src([ 'bower_components/bootstrap/dist/css/bootstrap.css',
                      'bower_components/bootstrap/dist/css/bootstrap-theme.css',
                      'bower_components/toastr/toastr.scss',
                      'bower_components/font-awesome/css/font-awesome.css' ])
               .pipe(changed(dest))
               .pipe(using({}))
               //.pipe(sass(config)).on('error', gutil.log)
               .pipe(concat('style.lib.css'))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-sass', function() 
{
    var config = {};
    var dest =  path.join(publicDir, 'css');

    // =========================================
    // MAP CAN'T DEAL WITh RELATIVE FILES ?????
    // =========================================
    //if (env === 'development') 
    //{
    //    config.sourceComments = 'map';
    //}

    if (env === 'production') 
    {
        config.outputStyle = 'compressed';
    }

    return gulp.src([
                      'src/client/app/scss/style.scss'
                    ])
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(sass(config)).on('error', gutil.log)
               .pipe(concat('style.css'))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-fonts', ['init:bower-install'], function() {

    var dest =  path.join(publicDir, 'fonts');

    return gulp.src([ 'bower_components/bootstrap/fonts/*.*',
                      'bower_components/font-awesome/fonts/*.*' ])
               .on('error', gutil.log)
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

gulp.task('client-images', function() {

    var dest = path.join(publicDir, 'img');

    return gulp.src(['src/client/app/img/**/*.*'
                ])
               .on('error', gutil.log)
               .pipe(changed(dest))
               .pipe(gulp.dest(dest))
               .pipe(connect.reload());
});

// gulp.task('client-service-js', function() 
// {
//     var scriptsPath = 'src/client/';
//     var dest = path.join(publicDir, 'js');

//     var folders = getFolders(scriptsPath);
//     var streams = folders.map(function(folder) 
//     {
//         if ( folder === 'app')
//           return;

//         var code = path.join(scriptsPath, folder, '**/*.js');
//         //var view = path.join(scriptsPath, folder, '**/*.html');

//         //var codeFilter = filter('**/*.js');     // deal with js files
//         //var viewFilter = filter('**/*.html');   // deal with html files

//         return gulp.src([code,view])
//                    .pipe(using({}))

//                    //.pipe(codeFilter)
//                    .pipe(gulpif(env !== 'production', jshint() ))
//                    .pipe(gulpif(env === 'development', jshint.reporter('jshint-stylish') ))
//                    .pipe(gulpif(env === 'test', jshint.reporter('default') ))
//                    //.pipe(codeFilter.restore())

//                    //.pipe(viewFilter)
//                    ////.pipe(gulpif(env !== 'development', minifyHtml())) - Wrecks the templates on link-to
//                    //.pipe(handlebars(
//                    //{
//                    //     outputType: 'browser', 
//                    //     templateRoot: folder
//                    //}))
//                    //.pipe(viewFilter.restore())

//                    .pipe(concat( folder + '.js'))
//                    .pipe(browserify({ debug: env === 'development' })).on('error', gutil.log)
//                    .pipe(gulpif(env === 'production', uglify() ))
//                    .pipe(gulpif(env === 'production', rename(folder + '.min.js'), rename(folder + '.js') ))
//                    //.pipe(changed(dest))

//                    .pipe(gulp.dest(dest))
//                    .pipe(connect.reload())
//                    .on('error', gutil.log)
//     });

//     return es.concat.apply(null, streams);
// });


// ====================================
//               DATA
// ====================================

//  Drop the database
gulp.task('drop-data', function () {
        
    var cmd = '(mongo circle --eval "db.dropDatabase()")';

    // mongo <dbname> --eval "db.dropDatabase()"
    return gulp.src('').pipe(shell([cmd]));
});

// Reload the database - NOT WORKING
gulp.task('load-data', function() 
{
    var cmd = '(mongo --eval localhost:27017/circle ./server/data/mockdata.js)';

    return gulp.src('').pipe(shell([cmd]));
});

gulp.task('mock-data', function() 
{
    var dest =  path.join(website, 'models');

    return gulp.src('test/mock/*.json')
               .pipe(changed(dest))
               .pipe(using({}))
               .pipe(gulp.dest(dest))
               .on('error', gutil.log);
});

gulp.task('server-models', ['server-config'], function() {

    var config = require(configFile);
    if ( config && config.mocking )
    {
        var dest =  path.join(website, 'models');

        return gulp.src('test/mock/*.json')
                   .pipe(changed(dest))
                   .pipe(using({}))
                   .pipe(gulp.dest(dest))
                   .on('error', gutil.log);
    }
});


// ====================================
//              TESTING
// ====================================
gulp.task('clean:tests', function() 
{ 
    // do not install tests into deployment environment
    return gulp.src(testDir)
               .pipe(clean({force: true}))
               .on('error', gutil.log);
}); 

// Init: Copy test before mocha / coverage runs them
gulp.task('init:tests', ['clean:tests'], function() 
{ 
    // do not install tests into deployment environment
    if ( env !== 'production' ) 
    {
        var dest = testDir;
        return gulp.src('test/**/*.js')
                   .pipe(changed(dest))
                   .pipe(using({}))
                   .pipe(gulp.dest(dest))
                   .on('error', gutil.log);
    }
}); 

gulp.task('mocha', ['init:tests'], function(done) 
{
    if ( env !== 'production' ) 
    {
//        try
//        {
            //var dest = testDir;
            var mochaOptions = 
            {
                slow:250,
                timeout:5000,
                ui: 'bdd',              
                ignoreLeaks: false,
                require:[ 'should' ]
            };     

            return gulp.src(path.join( testDir, '*.js'), { read:false })
                .pipe(mocha({options: mochaOptions, reporter: 'spec'}))
                .on('error', gutil.log)
                .once('end', function () {
                   process.exit();
                });
//        }
//        catch( e )
//        {
//           console.log(e);
//        }
    }
});

gulp.task('test-coverage', function(done) 
{
    if ( env !== 'production' ) 
    {
        var istanbul = require('gulp-istanbul');

        gulp.src([
            path.join( website, 'api/*.js'),
            path.join( website, 'app_start/*.js'),
            path.join( website, 'auth/*.js'),
            path.join( website, 'models/*.js')
        ])
        // Instrument the source files 
        .pipe(istanbul()).on('error', gutil.log)
        .on('finish', function() 
        {
            gulp.src([path.join( website, 'test/*.js')])
                .pipe(using({}))
                .pipe(mocha()).on('error', gutil.log)
                .pipe(istanbul.writeReports()).on('error', gutil.log) 
                .on('end', done);
        });
    }
});

// ====================================
//           FILE WATCHING
// ====================================
gulp.task('watch', function() {

    //Server side file updates / additions
    gulp.watch('src/server/**/*.js',              ['server-js']);
    gulp.watch('src/server/app_start/env/*.json', ['server-config']);
    gulp.watch('src/addins/website/*.*',          ['server-addins']);

// -----------------------------

    /* change must be copied to both */
    gulp.watch('src/services/**/*.js',            ['worker-services-js', 'server-services-js']);

// -----------------------------

    // Client side file updates / additions
    gulp.watch('src/client/app/*.js',             ['client-js']);

    gulp.watch(['src/client/app/modules/*.js',
                'src/client/app/services/*.js'],  ['client-angular-js']);

    gulp.watch(['src/client/app/**/*.js', 
                '!src/client/app/*.js',
                '!src/client/app/modules/*.js'],  ['client-app-js']);

    gulp.watch(['src/client/app/polyfill/*.js'],  ['client-polyfill-js']);

    gulp.watch(['src/client/**/*.html', 
                'src/client/*.ico' ],             ['client-views']);
    gulp.watch('src/client/app/**/*.scss',        ['client-sass']);
    gulp.watch('src/client/app/img/**/*.*',       ['client-images']);

    gulp.watch('src/client/services/**/*.html',   ['client-service-js']);
    gulp.watch('src/client/services/**/*.js',     ['client-service-js']);

// -----------------------------

    gulp.watch('test/mock/*.json',                ['mock-data']);
    gulp.watch('test/*.js',                       ['init:tests']);

// -----------------------------

    gulp.watch('./gulpfile.js', function(evt) {

        // KILL PROCESS as we cant CONTINUE
        gutil.log(gutil.colors.bold.gray('------------------------------------------'));
        gutil.log(gutil.colors.bold.cyan('You have changed the gulp definition file.'));
        gutil.log(gutil.colors.bold.gray('------------------------------------------'));
        gutil.log(gutil.colors.bold.yellow('To apply changes you need to restart gulp.'));
        gutil.beep();
        process.exit(-1);                   
    });

    // ************************************************************
    // This function runs once for each file that is copied above.
    // Since there are wildcards paths this can run multiple times.
    // Some fucntion combine fines into a single destination file
    // other have a '.pipe(changed(dest))' so only teh chnage file
    // causes this function to be triggered, client side files are
    // reloaded by the browser using livereload, not node restart.
    // ************************************************************

    gulp.watch([ path.join(website, 'server.js'), 
                 path.join( website, 'api', '*.js'), 
                 path.join( website, 'app_start', '**/*.*'), 
                 path.join( website, 'auth', '*.js'), 
                 path.join( website, 'services', '**/*.js')//,
                 //'!' + path.join(website, 'test/*.js')
                 ], function(evt) 
                 
    {
        var fileName = path.relative(website, evt.path);
                
        // check if the file is changed
        if ( evt.type == 'changed' ) 
        {
            plugins.util.log('Detected updated file ' + fileName + ', reloading server');
            async.series([
            
                // Restart Express server
                app.stop,
                app.start,

                // Send reload notification to browser
                function(callback) 
                {
                    lr.changed(
                    {
                        body: 
                        {
                            files: [fileName]
                        }
                    });

                    callback();
                }
           ]);
        }
    });
});

// ====================================
//         BROWSER LIVE RELOAD
// ====================================
gulp.task('connect', function() 
{
    connect.server
    ({
        root: [ publicDir ], livereload: true
    });
});

// =================
//     install
// =================
gulp.task('install', ['deploy', 'server', 'client'] );
gulp.task('clean', ['init:clean' ]);
gulp.task('reinstall', ['server', 'client'] );

// =================
//      Deploy 
// =================
gulp.task('deploy', ['init:clean', 'init:bower-install' ]);

// =================
//      server
// =================
gulp.task('server', ['server-js', 'server-services-js', 'server-addins', 'server-config', 'server-npm']);

// =================
//      client
// =================
gulp.task('client', [ 'client-library', 'client-polyfill-js',
                      'client-js', 'client-angular-js', 'client-app-js', 
                      'client-views', 'client-lib-styles', 'client-sass',
                      'client-images', 'client-fonts' /*, 'client-service-js'*/ ]);

// =================
//   test (alias)
// =================
gulp.task('test', [ 'clean:tests', 'init:tests', 'mocha' ]);
          
// =================
//   coverage (alias)
// =================
gulp.task('coverage', [ 'clean:tests', 'init:tests', 'test-coverage' ]);

// =================
//    config [env]
// =================
gulp.task('config', ['server-config']);

// =================
//       data
// =================
gulp.task('data', [ 'drop-data', 'load-data' ]);

// =================
//       data
// =================
gulp.task('mock', [ 'mock-data' ]);

// =================
//      start
// =================
gulp.task('start', ['watch', 'connect'], function (callback) {

    async.series([ app.start,  function(callback) { lr = tinyLr(); lr.listen(lrPort, callback);}], callback);
});

function handleError(err) {

    console.log(err.toString());
    this.emit('end');
}

gulp.task('default', ['start']);
