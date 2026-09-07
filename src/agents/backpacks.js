import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { BACKPACKS } from './personality.js'

// Each collectible is one shared geometry and one instanced draw, regardless of crew size.
function collectible(type) {
  const parts=[]
  const add=(geometry,color,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
    geometry.rotateX(rx);geometry.rotateY(ry);geometry.rotateZ(rz);geometry.translate(x,y,z)
    const c=new THREE.Color(color), count=geometry.attributes.position.count, colors=new Float32Array(count*3)
    for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b}
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(geometry)
  }
  const ball=(r,color,x=0,y=0,z=0,sx=1,sy=1,sz=1)=>{const g=new THREE.SphereGeometry(r,12,8);g.scale(sx,sy,sz);add(g,color,x,y,z)}
  const box=(w,h,d,c,x=0,y=0,z=0)=>add(new THREE.BoxGeometry(w,h,d),c,x,y,z)
  const ring=(r,t,c,x=0,y=0,z=0,rx=0,ry=0)=>add(new THREE.TorusGeometry(r,t,5,28),c,x,y,z,rx,ry)
  const eyes=(y=0,z=-0.30)=>{for(const x of [-0.13,0.13]){ball(.046,0x222737,x,y,z);ball(.013,0xffffff,x-.012,y+.015,z-.036)}}
  const smile=(y=-.1,z=-.31)=>ball(.05,0xffaab8,0,y,z,1,.55,.5)
  if(type==='icecream'){
    add(new THREE.ConeGeometry(.24,.55,14),0xd79b52,0,-.23,0,0,0,Math.PI)
    for(let i=0;i<4;i++)ring(.08+i*.043,.012,0xf4c582,0,-.41+i*.105,0,Math.PI/2)
    ball(.31,0xffadc8,0,.19,0,1,.94,.9);ball(.11,0xffdfec,-.2,.05,-.09)
    ball(.055,0xe94e63,0,.49,0)
    const colors=[0x62dccc,0xfff095,0x976bc9,0xffffff]
    for(let i=0;i<9;i++)box(.06,.018,.025,colors[i%4],Math.sin(i*2.4)*.23,.15+Math.cos(i*1.8)*.17,-.245)
  }else if(['cat','bear','bunny','frog'].includes(type)){
    const colors={cat:0xffc38b,bear:0xb77c54,bunny:0xe9def8,frog:0x93d67c},c=colors[type]
    ball(.36,c,0,0,0,1,1.05,.75)
    if(type==='cat')for(const x of [-.23,.23]){
      add(new THREE.ConeGeometry(.145,.28,3),c,x,.32,0,0,0,x<0?.15:-.15)
      add(new THREE.ConeGeometry(.075,.16,3),0xffa4b6,x,.34,-.085)
    }
    if(type==='bear')for(const x of [-.25,.25]){ball(.15,c,x,.29,0);ball(.085,0xeac098,x,.29,-.105)}
    if(type==='bunny')for(const x of [-.16,.16]){ball(.12,c,x,.42,0,1,2.2,.8);ball(.064,0xffb4c8,x,.45,-.07,1,2,.5)}
    if(type==='frog')for(const x of [-.23,.23]){ball(.145,c,x,.27,-.06);ball(.085,0xffffff,x,.30,-.18);ball(.042,0x222737,x,.30,-.252)}
    else eyes(.04)
    ball(.10,type==='bear'?0xeac098:0xffd2cf,0,-.10,-.25,1.35,.85,.5)
    smile(-.11,-.315)
    for(const x of [-.21,.21])ball(.055,0xffa5ac,x,-.06,-.245,1,.55,.5)
  }else if(type==='basketball'){
    ball(.38,0xeb873e)
    ring(.383,.015,0x553b30);ring(.383,.015,0x553b30,0,0,0,Math.PI/2);ring(.383,.015,0x553b30,0,0,0,0,Math.PI/2)
  }else if(type==='glove'){
    ball(.32,0xb9753d,0,-.09,0,1.05,.95,.5)
    for(let i=0;i<4;i++){ball(.095,0xc58a4c,-.23+i*.14,.21+Math.sin(i)*.07,0,1,2,.8);box(.035,.23,.04,0xe5bb7a,-.23+i*.14,.20,-.082)}
    ball(.115,0xb9753d,.32,-.02,-.03,1,1.8,.8)
    ball(.165,0xfff9e7,0,.025,-.19)
    for(const x of [-.065,.065])for(let i=0;i<4;i++)box(.045,.013,.014,0xc95555,x,-.06+i*.05,-.343)
  }else if(type==='car'){
    box(.86,.26,.4,0xf18a9f,0,-.08,0);box(.48,.25,.34,0xf9b1c4,0,.16,0)
    box(.37,.16,.02,0x8edcf0,0,.17,-.184)
    for(const x of [-.28,.28])for(const z of [-.21,.21]){ball(.135,0x293342,x,-.24,z,1,1,.6);ball(.065,0xe8f3fa,x,-.24,z*1.22,1,1,.3)}
    box(.08,.09,.04,0xffefb7,-.36,-.04,-.21);box(.08,.09,.04,0xffefb7,.36,-.04,-.21)
  }else if(type==='rocket'){
    add(new THREE.CylinderGeometry(.22,.22,.62,14),0xe7f1ff)
    add(new THREE.ConeGeometry(.225,.30,14),0xf28fa9,0,.46,0)
    for(const x of [-.26,.26])add(new THREE.ConeGeometry(.15,.33,3),0x8bd5d9,x,-.26,0)
    ball(.115,0x88dcef,0,.07,-.207,1,1,.35);ring(.12,.025,0xe9c169,0,.07,-.227)
    add(new THREE.ConeGeometry(.13,.24,10),0xffc866,0,-.43,0,0,0,Math.PI)
  }else if(type==='pizza'){
    add(new THREE.CylinderGeometry(.48,.48,.16,3),0xf5ca66,0,0,0,Math.PI/2)
    for(const [x,y] of [[0,.24],[-.14,-.01],[.13,-.05]])ball(.075,0xd96959,x,y,-.092,1,1,.25)
    box(.74,.085,.18,0xbe8745,0,-.24,0)
  }else if(type==='flower'){
    for(let i=0;i<9;i++){const a=i*Math.PI*2/9;ball(.145,0xffd46e,Math.sin(a)*.28,Math.cos(a)*.28,0,1,1,.5)}
    ball(.20,0x9d7256,0,0,-.025,1,1,.55);eyes(.015,-.16);smile(-.08,-.17)
    box(.055,.36,.06,0x70ac79,0,-.35,.04)
  }else{
    ball(.37,0xb3a1ed,0,0,0,1.3,.75,.55)
    box(.18,.05,.04,0x3a3955,-.23,.025,-.22);box(.05,.18,.04,0x3a3955,-.23,.025,-.22)
    for(const [x,y,c] of [[.23,.1,0xffa0b7],[.30,0,0x92e9d1],[.16,0,0xffdf8c],[.23,-.1,0x9dceff]])ball(.04,c,x,y,-.20)
  }
  const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());return geometry
}

export class Backpacks {
  constructor(group,capacity){
    this.group=group;this.meshes=new Map();this.counts=new Map();this.matrix=new THREE.Matrix4();this.offset=new THREE.Matrix4();this.color=new THREE.Color()
    this.material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.65,metalness:.02})
    for(const {id} of BACKPACKS){
      const mesh=new THREE.InstancedMesh(collectible(id),this.material,capacity)
      mesh.name='Collectible backpack: '+id;mesh.count=0;mesh.frustumCulled=false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      mesh.setColorAt(0,this.color.set(0xffffff));mesh.instanceColor.setUsage(THREE.DynamicDrawUsage)
      this.meshes.set(id,mesh);group.add(mesh)
    }
  }
  begin(){for(const id of this.meshes.keys())this.counts.set(id,0)}
  write(personality,chest){
    const id=personality.backpack.id,mesh=this.meshes.get(id),index=this.counts.get(id)
    this.offset.makeScale(personality.scale,personality.scale,personality.scale)
    this.offset.setPosition(0,.10,-.53)
    this.matrix.multiplyMatrices(chest,this.offset)
    mesh.setMatrixAt(index,this.matrix);mesh.setColorAt(index,this.color.setHex(personality.tint));this.counts.set(id,index+1)
  }
  end(){for(const [id,mesh] of this.meshes){mesh.count=this.counts.get(id);mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true}}
  setShadows(on){for(const mesh of this.meshes.values())mesh.castShadow=on}
  dispose(){for(const mesh of this.meshes.values()){this.group.remove(mesh);mesh.geometry.dispose()}this.material.dispose()}
}
