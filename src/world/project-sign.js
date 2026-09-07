import * as THREE from 'three'
import { FontLoader } from 'three/addons/loaders/FontLoader.js'
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js'
import fontData from '../../public/assets/sign-font.json'

const font = new FontLoader().parse(fontData)

/** Individual raised letters on a visible steel tower; no panel or billboard. */
export function createProjectSign(identity, accent, height = 12) {
  const sign = new THREE.Group()
  sign.name = 'Headquarters skyline letters'
  const metal = new THREE.MeshStandardMaterial({ color: 0x536374, roughness: 0.55, metalness: 0.7 })
  const letters = new THREE.MeshStandardMaterial({ color: 0xfff8e9, roughness: 0.35, metalness: 0.2, emissive: accent, emissiveIntensity: 0.35 })
  const beam = (a, b, radius = 0.055) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, start.distanceTo(end), 6), metal)
    mesh.position.copy(start).add(end).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), end.sub(start).normalize())
    mesh.castShadow = true; mesh.receiveShadow = true; sign.add(mesh)
  }
  const text = identity.displayName.toUpperCase()
  const geometry = new TextGeometry(text, { font, size: 0.95, depth: 0.13, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1 })
  geometry.computeBoundingBox()
  const bounds = geometry.boundingBox, width = bounds.max.x - bounds.min.x
  const center = (bounds.min.x + bounds.max.x) * 0.5
  const scale = Math.min(1, 7.5 / Math.max(width, 1))
  geometry.scale(scale, scale, 1)
  geometry.translate(-center * scale, height + 0.15, 0)
  const label = new THREE.Mesh(geometry, letters)
  label.castShadow = true; label.receiveShadow = true; sign.add(label)
  const span = Math.max(1.5, Math.min(3.6, width * scale / 2))
  // Uprights begin on the headquarters platform, with open cross-bracing above its roof.
  for (const x of [-0.8, 0.8]) beam([x, 0, 0.18], [x, height + 0.10, 0.18], 0.075)
  beam([-span,height+0.06,0.18], [span,height+0.06,0.18], 0.07)
  for (let y=5; y<height-1; y+=1.7) {
    beam([-.8,y,.18],[.8,Math.min(y+1.7,height),.18],.035)
    beam([.8,y,.18],[-.8,Math.min(y+1.7,height),.18],.035)
  }
  if(identity.badge==='website'){
    const web = new TextGeometry('WWW', {font,size:.34,depth:.08,curveSegments:3})
    web.computeBoundingBox();web.translate(-(web.boundingBox.max.x+web.boundingBox.min.x)/2,height+1.2,0)
    const mesh=new THREE.Mesh(web,letters);mesh.castShadow=true;sign.add(mesh)
    beam([0,height+.7,.18],[0,height+1.25,.18],.035)
  }
  sign.rotation.y = Math.PI / 4
  sign.userData.physical = true
  sign.userData.lettersOnly = true
  sign.userData.letterHeight = height
  sign.userData.dispose = () => {
    sign.traverse(object => object.geometry?.dispose())
    metal.dispose(); letters.dispose()
  }
  return sign
}
