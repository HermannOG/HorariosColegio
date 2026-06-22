import { useEffect, useState } from 'react'
import { obtenerGrilla, guardarGrilla } from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Select, Spinner } from '../components/ui.jsx'

let contadorId = 0
function nuevoId() { return `nuevo-${Date.now()}-${contadorId++}` }

export default function GrillaPage() {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [bloques, setBloques] = useState([])
  const [guardado, setGuardado] = useState(false)

  useEffect(() => {
    obtenerGrilla().then(g => { setBloques(g.bloques); setCargando(false) })
  }, [])

  function actualizarBloque(id, cambios) {
    setBloques(prev => prev.map(b => (b.id === id ? { ...b, ...cambios } : b)))
    setGuardado(false)
  }

  function agregarBloque() {
    setBloques(prev => [
      ...prev,
      { id: nuevoId(), numero: '', horaInicio: '', horaFin: '', tipo: 'clase' },
    ])
  }

  function eliminarBloque(id) {
    setBloques(prev => prev.filter(b => b.id !== id))
  }

  async function guardar() {
    setGuardando(true)
    await guardarGrilla(bloques)
    setGuardando(false)
    setGuardado(true)
  }

  if (cargando) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Grilla del día"
        subtitle="Definí las lecciones, recreos y almuerzo, con sus horas. Esta grilla se usa todos los días, de lunes a viernes."
        action={
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando…' : guardado ? 'Guardado ✓' : 'Guardar cambios'}
          </Button>
        }
      />
      <div className="px-10 py-8 max-w-3xl">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[3rem_1fr_1fr_1fr_2.5rem] gap-3 px-4 py-2.5 bg-ink-50 text-xs font-semibold text-ink-500 uppercase tracking-wide">
            <span>Núm.</span>
            <span>Hora inicio</span>
            <span>Hora fin</span>
            <span>Tipo</span>
            <span></span>
          </div>
          <div className="divide-y divide-ink-100">
            {bloques.map(b => (
              <FilaBloque
                key={b.id}
                bloque={b}
                onChange={cambios => actualizarBloque(b.id, cambios)}
                onEliminar={() => eliminarBloque(b.id)}
              />
            ))}
          </div>
        </Card>
        <button
          onClick={agregarBloque}
          className="mt-3 text-sm font-medium text-sage-700 hover:text-sage-800"
        >
          + Agregar bloque
        </button>
      </div>
    </div>
  )
}

function FilaBloque({ bloque, onChange, onEliminar }) {
  const esClase = bloque.tipo === 'clase'
  return (
    <div className={`grid grid-cols-[3rem_1fr_1fr_1fr_2.5rem] gap-3 px-4 py-2.5 items-center ${!esClase ? 'bg-sage-50' : ''}`}>
      {esClase ? (
        <Input value={bloque.numero} onChange={e => onChange({ numero: e.target.value })} placeholder="1°" />
      ) : (
        <span className="text-xs text-ink-400 text-center">—</span>
      )}
      <Input type="time" value={bloque.horaInicio} onChange={e => onChange({ horaInicio: e.target.value })} />
      <Input type="time" value={bloque.horaFin} onChange={e => onChange({ horaFin: e.target.value })} />
      <Select value={bloque.tipo} onChange={e => onChange({ tipo: e.target.value, etiqueta: e.target.value === 'clase' ? undefined : (bloque.etiqueta || (e.target.value === 'recreo' ? 'Recreo' : 'Almuerzo')) })}>
        <option value="clase">Clase</option>
        <option value="recreo">Recreo</option>
        <option value="almuerzo">Almuerzo</option>
      </Select>
      <button onClick={onEliminar} className="text-ink-300 hover:text-clay-600 text-sm" title="Eliminar bloque">✕</button>
    </div>
  )
}
