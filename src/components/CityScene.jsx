import { useState, useEffect, useMemo, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { createProjector } from '@/lib/geo'
import { fetchCityData } from '@/lib/overpass'
import { buildEdges, computeIsovist } from '@/lib/isovist'
import {
  CENTER_LAT,
  CENTER_LON,
  HALF_EXTENT_METERS,
  ISOVIST_MAX_RADIUS,
  ISOVIST_RAY_COUNT,
} from '@/lib/config'
import { Buildings } from './Buildings'
import { Streets } from './Streets'
import { Ground } from './Ground'
import { IsovistOverlay } from './IsovistOverlay'

export function CityScene({ onStatusChange }) {
  const [cityData, setCityData] = useState(null)
  const [isovist, setIsovist] = useState(null)

  const projector = useMemo(() => createProjector(CENTER_LAT, CENTER_LON), [])

  useEffect(() => {
    let cancelled = false
    onStatusChange({ loading: true, error: null })

    const bbox = projector.bbox(HALF_EXTENT_METERS)
    fetchCityData(bbox, projector)
      .then((data) => {
        if (cancelled) return
        setCityData(data)
        onStatusChange({
          loading: false,
          error: null,
          buildingCount: data.buildings.length,
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error('Failed to load city data from the Overpass API:', err)
        onStatusChange({ loading: false, error: err.message })
      })

    return () => {
      cancelled = true
    }
  }, [projector, onStatusChange])

  const edges = useMemo(() => (cityData ? buildEdges(cityData.buildings) : []), [cityData])

  const handleGroundClick = useCallback(
    (point) => {
      if (!cityData) return
      const polygon = computeIsovist(point, edges, {
        rayCount: ISOVIST_RAY_COUNT,
        maxRadius: ISOVIST_MAX_RADIUS,
      })
      setIsovist({ origin: point, polygon })
    },
    [cityData, edges]
  )

  return (
    <Canvas camera={{ position: [0, 220, 320], fov: 50, near: 1, far: 5000 }}>
      <color attach="background" args={['#f3f4f7']} />
      <hemisphereLight args={['#ffffff', '#dbe1ea', 1.1]} />
      <directionalLight position={[300, 400, 200]} intensity={1.2} />

      <Ground onGroundClick={handleGroundClick} />

      {cityData && (
        <>
          <Buildings buildings={cityData.buildings} />
          <Streets streets={cityData.streets} />
        </>
      )}

      {isovist && <IsovistOverlay origin={isovist.origin} points={isovist.polygon} />}

      <OrbitControls
        enablePan
        enableRotate
        enableZoom
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={20}
        maxDistance={1500}
      />
    </Canvas>
  )
}
