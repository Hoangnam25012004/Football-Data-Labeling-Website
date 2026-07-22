/* Entry point for the whole suite:  node tests/run.js
   (each *.test.js file can also be run on its own). */
const fs=require('fs'), path=require('path');
fs.readdirSync(__dirname).filter(f=>f.endsWith('.test.js')).sort()
  .forEach(f=>{console.log('\n'+f);require(path.join(__dirname,f));});
