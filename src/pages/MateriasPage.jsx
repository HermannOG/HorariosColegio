import { useEffect, useState } from 'react'
import { listarMaterias, crearMateria, eliminarMateria } from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Spinner, EmptyState } from '../components/ui.jsx'

export default function MateriasPage() {
  const [cargando, setCargando] = useState(true)
  const [materias, setMaterias] = useState([])
  const [nombreNuevo, setNombreNuevo] = useState('')
  const [creando, setCreando] = useState(false)

  async function recargar() {
    setMaterias(await listarMaterias())
  }

  useEffect(() => {
    recargar().then(() => setCargando(false))
  }, [])

  async function agregar(e) {
    e.preventDefault()
    if (!nombreNuevo.trim()) return
    setCreando(true)
    await crearMateria(nombreNuevo.trim())
    setNombreNuevo('')
    await recargar()
    setCreando(false)
  }

  async function eliminar(id) {
    await eliminarMateria(id)
    await recargar()
  }

  return (
    <div>
      <PageHeader
        title="Materias"
        subtitle="Las materias que se imparten en el colegio (Cívica, Matemática, Español...)."
      />
      <div className="px-10 py-8 max-w-xl">
        <form onSubmit={agregar} className="flex gap-2 mb-6">
          <Input
            value={nombreNuevo}
            onChange={e => setNombreNuevo(e.target.value)}
            placeholder="Nombre de la materia"
          />
          <Button type="submit" disabled={creando}>Agregar</Button>
        </form>

        {cargando ? <Spinner /> : materias.length === 0 ? (
          <EmptyState
            title="Todavía no hay materias"
            description="Agregá la primera materia con el campo de arriba."
          />
        ) : (
          <Card className="divide-y divide-ink-100">
            {materias.map(m => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-ink-800">{m.nombre}</span>
                <button
                  onClick={() => eliminar(m.id)}
                  className="text-ink-300 hover:text-clay-600 text-sm"
                  title="Eliminar materia"
                >
                  ✕
                </button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
