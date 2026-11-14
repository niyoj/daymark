import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const root='docs/images/gallery';
const sizes={desktop:[1200,800],mobile:[900,1600]};
const files=[];
for(const [device,[width,height]] of Object.entries(sizes)){
  const names=(await fs.readdir(`${root}/${device}`)).filter(name=>name.endsWith('.png')).sort();
  assert.equal(names.length,5,`Expected five ${device} gallery screenshots`);
  for(const name of names){
    const path=`${root}/${device}/${name}`,image=await fs.readFile(path);
    assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a',`Invalid PNG: ${path}`);
    assert.equal(image.readUInt32BE(16),width,`Incorrect width: ${path}`);
    assert.equal(image.readUInt32BE(20),height,`Incorrect height: ${path}`);
    assert.ok(image.length<5_000_000,`Image exceeds 5 MB: ${path}`);
    files.push({path,width,height,bytes:image.length});
  }
}
console.log(JSON.stringify({passed:true,images:files},null,2));
