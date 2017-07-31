/**
 * Build Node CLI Bin
 */

var fs = require('fs-extra');
var path = require('path');
var webpack = require('webpack');
var uglify = require('uglify-es');


var TRANSPILED_DIR = path.join(__dirname, '../build/transpiled-cli');
var DIST_BUILD_DIR = path.join(__dirname, '../build');
var DIST_BUILD_BIN_DIR = path.join(DIST_BUILD_DIR, 'bin');
var SRC_NODE_MODULES = path.join(__dirname, '../node_modules');
var DEST_NODE_MODULES = path.join(__dirname, '../build/bin');


function bundleCli() {
  console.log('bundling node bin cli...');

  fs.emptyDirSync(DIST_BUILD_BIN_DIR);

  var ENTRY_FILE = path.join(TRANSPILED_DIR, 'compiler/cli/index.js');

  webpack({
    entry: ENTRY_FILE,
    output: {
      path: DIST_BUILD_BIN_DIR,
      filename: 'cli.js'
    },
    target: 'node'

  }, function(err, stats) {
    if (err) {
      console.log(err);
      return;
    }

    copyBinExec();
    createNpmPackageJson();

    localNodeModules([
      {
        id: 'chalk',
        entry: 'index.js'
      },
      {
        id: 'chokidar',
        entry: 'index.js'
      },
      {
        id: 'clean-css',
        entry: 'index.js'
      },
      {
        id: 'fs-extra',
        entry: ['lib/copy/index.js', 'lib/remove/index.js'],
        outputFileName: 'index.js'
      },
      {
        id: 'node-fetch',
        entry: 'index.js'
      },
      {
        id: 'rollup',
        entry: 'dist/rollup.js'
      },
      {
        id: 'rollup-plugin-commonjs',
        entry: 'dist/rollup-plugin-commonjs.cjs.js'
      },
      {
        id: 'rollup-plugin-node-resolve',
        entry: 'dist/rollup-plugin-node-resolve.cjs.js'
      },
      {
        id: 'uglify-es',
        entry: 'tools/node.js',
        copyFiles: [
          'lib/utils.js',
          'lib/ast.js',
          'lib/parse.js',
          'lib/transform.js',
          'lib/scope.js',
          'lib/output.js',
          'lib/compress.js',
          'lib/sourcemap.js',
          'lib/mozilla-ast.js',
          'lib/propmangle.js',
          'lib/minify.js',
          'tools/domprops.json',
          'tools/exports.js',
          'tools/props.html',
        ]
      }
    ]);
  });
}


function copyBinExec() {
  var src = path.join(__dirname, '../src/compiler/cli/stencil');
  var dest = path.join(DIST_BUILD_BIN_DIR, 'stencil');
  fs.copySync(src, dest);
}


function createNpmPackageJson() {
  console.log('createNpmPackageJson');

  var srcPackageJson = path.join(__dirname, '../package.json');
  var distPackageJson = path.join(DIST_BUILD_DIR, 'package.json');

  // create our package.json built for npm
  var packageJsonStr = fs.readFileSync(srcPackageJson);
  var packageJsonData = JSON.parse(packageJsonStr);

  packageJsonData.main = 'dist/index.js';
  packageJsonData.types = 'dist/index.d.ts';

  // slim down the original package.json
  delete packageJsonData.private;
  delete packageJsonData.scripts;
  delete packageJsonData.devDependencies;
  delete packageJsonData.jest;

  // write our new package.json
  fs.writeFileSync(distPackageJson, JSON.stringify(packageJsonData, null, 2));
}


function localNodeModules(packages) {
  packages.forEach(function(package) {
    localNodeModule(package);
  });
}


function localNodeModule(package) {
  var srcNodeModule = path.join(SRC_NODE_MODULES, package.id);
  var destNodeModule = path.join(DEST_NODE_MODULES, package.id);
  fs.ensureDirSync(destNodeModule);

  try {
    var srcLicenseFile = path.join(srcNodeModule, 'LICENSE');
    var destLicensenFile = path.join(destNodeModule, 'LICENSE');
    fs.copySync(srcLicenseFile, destLicensenFile);

  } catch (e) {
    try {
      var srcLicenseFile = path.join(srcNodeModule, 'LICENSE');
      var destLicensenFile = path.join(destNodeModule, 'LICENSE.md');
      fs.copySync(srcLicenseFile, destLicensenFile);
    } catch (e) {}
  }

  if (package.copyFiles) {
    package.copyFiles.forEach(function(copyFile) {
      var srcCopyFile = path.join(srcNodeModule, copyFile);
      var destCopyFile = path.join(destNodeModule, copyFile);
      fs.ensureDirSync(path.dirname(destCopyFile));
      fs.copySync(srcCopyFile, destCopyFile);
    });
  }

  if (!Array.isArray(package.entry)) {
    package.entry = [package.entry];
  }

  var srcEntries = package.entry.map(function(entry) {
    return path.join(srcNodeModule, entry);
  });

  var outputFileName = package.outputFileName || package.entry[0];

  webpack({
    entry: srcEntries,
    output: {
      path: destNodeModule,
      filename: outputFileName
    },
    target: 'node'

  }, function(err, stats) {
    if (err) {
      console.log(err);
      return;
    }

    console.log('bundled:', path.join(destNodeModule, outputFileName));

    // var result = uglify.minify(fs.readFileSync(path.join(destNodeModule, srcPackage.main), 'utf-8'));

    // fs.writeFileSync(path.join(destNodeModule, srcPackage.main), result.code);
  });
}


bundleCli();


process.on('exit', (code) => {
  fs.removeSync(TRANSPILED_DIR);
});
