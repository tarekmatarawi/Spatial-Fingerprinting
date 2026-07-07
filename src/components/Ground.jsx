import { HALF_EXTENT_METERS } from '@/lib/config'

// A large flat plane that both renders the ground and catches clicks —
// clicking it is how the isovist origin point gets picked.
export function Ground({ onGroundClick }) {
  const size = HALF_EXTENT_METERS * 2.2

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(event) => {
        event.stopPropagation()
        onGroundClick({ x: event.point.x, z: event.point.z })
      }}
    >
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#eef0f3" />
    </mesh>
  )
}
