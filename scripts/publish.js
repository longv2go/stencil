var fs = require('fs');
var path = require('path');
var copyDir = require('../bin/copy-directory');
var rimraf = require('../bin/rimraf');
var webpack = require('webpack');


var npmBuild = path.join(__dirname, '../node_modules/__npm-build');


function copyDist() {
  var srcDist = path.join(__dirname, '../dist');
  var npmDist = path.join(npmBuild, 'dist');

  return new Promise(function(resolve) {
    console.log('copyDist');

    function filter(src) {
      if (src.indexOf('.d.ts') > -1) {
        return false;
      }
      return true;
    }

    copyDir(srcDist, npmDist, { filter: filter }, resolve);

  });
}


function createBin() {
  var srcBin = path.join(__dirname, '../bin');
  var npmBin = path.join(npmBuild, 'bin');

  fs.mkdirSync(npmBin);

  var srcStencil = path.join(srcBin, 'stencil');
  var npmStencil = path.join(npmBin, 'stencil');
  fs.writeFileSync(npmStencil, fs.readFileSync(srcStencil, 'utf-8'));

  var srcSys = path.join(srcBin, 'sys.js');
  var npmSys = path.join(npmBin, 'sys.js');
  fs.writeFileSync(npmSys, fs.readFileSync(srcSys, 'utf-8'));

  bundleNodeModule(srcBin, npmBin, 'chalk.js');
  bundleNodeModule(srcBin, npmBin, 'chokidar.js');
  bundleNodeModule(srcBin, npmBin, 'clean-css.js');
  bundleNodeModule(srcBin, npmBin, 'node-fetch.js');
  bundleNodeModule(srcBin, npmBin, 'node-sass.js');
  bundleNodeModule(srcBin, npmBin, 'rollup.js');
  bundleNodeModule(srcBin, npmBin, 'uglify-es.js');

  bundleNodeModule(srcBin, npmBin, 'create-dom.js', function() {
    // require("punycode");
    var punycodeFilePath = path.join(__dirname, '../node_modules/punycode/punycode.js');
    var punycodeContent = fs.readFileSync(punycodeFilePath, 'utf-8');
    punycodeContent = punycodeContent.replace(';(function(root)', '(function(root)');

    var UglifyJS = require('uglify-es');
    var result = UglifyJS.minify(punycodeContent);

    var createdDomFilePath = path.join(npmBin, 'create-dom.js');

    var creadDomContent = fs.readFileSync(createdDomFilePath, 'utf-8');
    creadDomContent = creadDomContent.replace('require("punycode")', result.code);

    fs.writeFileSync(createdDomFilePath, creadDomContent);
  });

}


function bundleNodeModule(srcBin, npmBin, moduleFileName, done) {
  webpack({
    entry: [
      path.join(srcBin, moduleFileName)
    ],
    output: {
      filename: moduleFileName,
      path: npmBin
    },
    target: 'node'

  }, function(err, stats) {
    if (err) {
      console.log(err);
    } else {
      done && done();
    }
  });
}


function createNpmPackageJson() {
  console.log('createNpmPackageJson');

  var srcPackageJson = path.join(__dirname, '../package.json');
  var npmPackageJson = path.join(npmBuild, 'package.json');

  // create our package.json built for npm
  var packageJsonStr = fs.readFileSync(srcPackageJson);
  var packageJsonData = JSON.parse(packageJsonStr);

  // slim down the original package.json
  delete packageJsonData.private;
  delete packageJsonData.scripts;
  delete packageJsonData.devDependencies;
  delete packageJsonData.jest;

  var typescriptVersion = packageJsonData.dependencies.typescript;
  packageJsonData.dependencies = {
    'typescript': typescriptVersion
  };

  // write our new package.json
  fs.writeFileSync(npmPackageJson, JSON.stringify(packageJsonData, null, 2));
}


function copyReadMe() {
  console.log('copyReadMe');

  var srcReadme = path.join(__dirname, '../readme.md');
  var npmReadme = path.join(npmBuild, 'readme.md');

  var readme = fs.readFileSync(srcReadme, 'utf-8');

  // copy the same readme
  fs.writeFileSync(npmReadme, readme);
}


function done() {
  console.log('created npm build\n');
}


function clean() {
  // clean out and create the "npm" dist directory we'll publish
  rimraf.sync(npmBuild);
  fs.mkdirSync(npmBuild);
}


// clean();

// copyDist().then(function() {
//   createBin();
//   createNpmPackageJson();
//   copyReadMe();
//   done();
// });
