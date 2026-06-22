import { useEffect, useState } from 'react'
import {
  listarProfesores, crearProfesor, actualizarProfesor, eliminarProfesor,
  listarGrupos, listarMaterias, obtenerGrilla, obtenerMallas, DIAS,
} from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Select, Spinner, EmptyState, Pill } from '../components/ui.jsx'

const DIAS_LABEL = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie' }

const profesorVacio = () => ({
  nombre: '',
  diasNoTrabaja: [],
  bloquesPreferidos: [],
  bloquesEvitados: [],
  asignaciones: [],
})

export default function ProfesoresPage() {
  const [cargando, setCargando] = useState(true)
  const [profesores, setProfesores] = useState([])
  const [grupos, setGrupos] = useState([])
  const [materias, setMaterias] = useState([])
  const [bloquesClase, setBloquesClase] = useState([])
  const [mallas, setMallas] = useState({})
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(profesorVacio())
  const [guardando, setGuardando] = useState(false)

  async function recargar() {
    setProfesores(await listarProfesores())
  }

  useEffect(() => {
    async function cargar() {
      const [profs, gr, mat, grilla, malla] = await Promise.all([
        listarProfesores(), listarGrupos(), listarMaterias(), obtenerGrilla(), obtenerMallas(),
      ])
      setProfesores(profs)
      setGrupos(gr)
      setMaterias(mat)
      setBloquesClase(grilla.bloques.filter(b => b.tipo === 'clase'))
      setMallas(malla)
      setCargando(false)
    }
    cargar()
  }, [])

  function empezarNuevo() {
    setEditandoId('nuevo')
    setForm(profesorVacio())
  }

  function empezarEdicion(prof) {
    setEditandoId(prof.id)
    setForm({
      nombre: prof.nombre,
      diasNoTrabaja: prof.diasNoTrabaja || [],
      bloquesPreferidos: prof.bloquesPreferidos || [],
      bloquesEvitados: prof.bloquesEvitados || [],
      asignaciones: prof.asignaciones || [],
    })
  }

  function cancelar() {
    setEditandoId(null)
    setForm(profesorVacio())
  }

  async function guardar() {
    if (!form.nombre.trim()) return
    setGuardando(true)
    if (editandoId === 'nuevo') {
      await crearProfesor(form)
    } else {
      await actualizarProfesor(editandoId, form)
    }
    await recargar()
    setGuardando(false)
    cancelar()
  }

  async function eliminar(id) {
    await eliminarProfesor(id)
    await recargar()
    if (editandoId === id) cancelar()
  }

  if (cargando) return <Spinner />

  const hayPrerequisitos = grupos.length > 0 && materias.length > 0

  return (
    <div>
      <PageHeader
        title="Profesores"
        subtitle="Datos de cada profesor: días libres, preferencias de horario, y qué materias da a qué grupos."
        action={editandoId ? null : <Button onClick={empezarNuevo}>+ Nuevo profesor</Button>}
      />
      <div className="px-10 py-8">
        {!hayPrerequisitos && (
          <div className="mb-6 px-4 py-3 rounded-md bg-clay-50 border border-clay-200 text-sm text-clay-800">
            Antes de agregar profesores, te conviene crear al menos una materia y un grupo.
          </div>
        )}

        {editandoId && (
          <FormularioProfesor
            form={form}
            setForm={setForm}
            grupos={grupos}
            materias={materias}
            bloquesClase={bloquesClase}
            mallas={mallas}
            profesores={profesores}
            editandoId={editandoId}
            onGuardar={guardar}
            onCancelar={cancelar}
            guardando={guardando}
            esNuevo={editandoId === 'nuevo'}
          />
        )}

        {!editandoId && (
          profesores.length === 0 ? (
            <EmptyState
              title="Todavía no hay profesores"
              description="Agregá el primer profesor con el botón de arriba."
              action={<Button onClick={empezarNuevo}>+ Nuevo profesor</Button>}
            />
          ) : (
            <div className="grid gap-3 max-w-3xl">
              {profesores.map(p => (
                <Card key={p.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-ink-900">{p.nombre}</p>
                    <p className="text-xs text-ink-400 mt-0.5">
                      {(p.asignaciones || []).length} asignación(es)
                      {p.diasNoTrabaja?.length > 0 && ` · No trabaja: ${p.diasNoTrabaja.map(d => DIAS_LABEL[d]).join(', ')}`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => empezarEdicion(p)}>Editar</Button>
                    <Button variant="danger" onClick={() => eliminar(p.id)}>Eliminar</Button>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function FormularioProfesor({ form, setForm, grupos, materias, bloquesClase, mallas, profesores, editandoId, onGuardar, onCancelar, guardando, esNuevo }) {
  function toggleDia(dia) {
    setForm(f => ({
      ...f,
      diasNoTrabaja: f.diasNoTrabaja.includes(dia)
        ? f.diasNoTrabaja.filter(d => d !== dia)
        : [...f.diasNoTrabaja, dia],
    }))
  }

  function toggleBloque(lista, bloqueId) {
    return form[lista].includes(bloqueId)
      ? form[lista].filter(b => b !== bloqueId)
      : [...form[lista], bloqueId]
  }

  // Busca cuántas lecciones/semana pide la malla del año de un grupo para una materia.
  // grupo.anio puede ser '7','8','9','10','11'; si no hay malla definida, devuelve null.
  function leccionesSegunMalla(grupoId, materiaId) {
    const grupo = grupos.find(g => g.id === grupoId)
    if (!grupo) return null
    const filasAnio = mallas[grupo.anio] || []
    const fila = filasAnio.find(f => f.materiaId === materiaId)
    return fila ? Number(fila.leccionesPorSemana) : null
  }

  // Cuántas lecciones de esa materia+grupo ya están cubiertas por OTROS profesores
  // (para detectar huecos o excesos frente a la malla).
  function leccionesYaCubiertas(grupoId, materiaId, excluirIndiceLocal) {
    let total = 0
    profesores.forEach(p => {
      if (p.id === editandoId) return // este profesor se cuenta aparte, con el form en edición
      ;(p.asignaciones || []).forEach(a => {
        if (a.grupoId === grupoId && a.materiaId === materiaId) total += Number(a.leccionesPorSemana) || 0
      })
    })
    form.asignaciones.forEach((a, i) => {
      if (i === excluirIndiceLocal) return
      if (a.grupoId === grupoId && a.materiaId === materiaId) total += Number(a.leccionesPorSemana) || 0
    })
    return total
  }

  function agregarAsignacion() {
    if (grupos.length === 0 || materias.length === 0) return
    const grupoId = grupos[0].id
    const materiaId = materias[0].id
    const sugeridas = leccionesSegunMalla(grupoId, materiaId)
    setForm(f => ({
      ...f,
      asignaciones: [...f.asignaciones, { grupoId, materiaId, leccionesPorSemana: sugeridas ?? 2 }],
    }))
  }

  // Al cambiar grupo o materia de una fila, sugerimos automáticamente las lecciones
  // de la malla (si existe), pero el usuario puede seguir ajustándolo a mano después.
  function actualizarAsignacion(index, cambios) {
    setForm(f => {
      const asignaciones = f.asignaciones.map((a, i) => {
        if (i !== index) return a
        const actualizada = { ...a, ...cambios }
        if ('grupoId' in cambios || 'materiaId' in cambios) {
          const sugeridas = leccionesSegunMalla(actualizada.grupoId, actualizada.materiaId)
          if (sugeridas != null) actualizada.leccionesPorSemana = sugeridas
        }
        return actualizada
      })
      return { ...f, asignaciones }
    })
  }

  function quitarAsignacion(index) {
    setForm(f => ({ ...f, asignaciones: f.asignaciones.filter((_, i) => i !== index) }))
  }

  return (
    <Card className="p-6 max-w-3xl mb-8">
      <h3 className="font-display text-lg text-ink-900 mb-5">{esNuevo ? 'Nuevo profesor' : 'Editar profesor'}</h3>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1.5">Nombre completo</label>
          <Input
            value={form.nombre}
            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
            placeholder="Ej: Heidi Ruiz Víquez"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">Días que no trabaja</label>
          <div className="flex gap-2">
            {DIAS.map(d => (
              <Pill key={d} tone="clay" active={form.diasNoTrabaja.includes(d)} onClick={() => toggleDia(d)}>
                {DIAS_LABEL[d]}
              </Pill>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-2">Bloques preferidos</label>
            <p className="text-xs text-ink-400 mb-2">Se intentan respetar, sin garantía.</p>
            <div className="flex flex-wrap gap-1.5">
              {bloquesClase.map(b => (
                <Pill
                  key={b.id}
                  tone="sage"
                  active={form.bloquesPreferidos.includes(b.id)}
                  onClick={() => setForm(f => ({ ...f, bloquesPreferidos: toggleBloque('bloquesPreferidos', b.id), bloquesEvitados: f.bloquesEvitados.filter(x => x !== b.id) }))}
                >
                  {b.numero}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-2">Bloques a evitar</label>
            <p className="text-xs text-ink-400 mb-2">Se intentan respetar, sin garantía.</p>
            <div className="flex flex-wrap gap-1.5">
              {bloquesClase.map(b => (
                <Pill
                  key={b.id}
                  tone="clay"
                  active={form.bloquesEvitados.includes(b.id)}
                  onClick={() => setForm(f => ({ ...f, bloquesEvitados: toggleBloque('bloquesEvitados', b.id), bloquesPreferidos: f.bloquesPreferidos.filter(x => x !== b.id) }))}
                >
                  {b.numero}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-ink-700">Grupos y materias que imparte</label>
            <button onClick={agregarAsignacion} className="text-sm font-medium text-sage-700 hover:text-sage-800">+ Agregar</button>
          </div>

          {form.asignaciones.length === 0 ? (
            <p className="text-sm text-ink-400 italic">Sin asignaciones todavía.</p>
          ) : (
            <div className="space-y-2">
              {form.asignaciones.map((a, i) => {
                const sugeridas = leccionesSegunMalla(a.grupoId, a.materiaId)
                const cubiertasOtros = leccionesYaCubiertas(a.grupoId, a.materiaId, i)
                const totalConEsta = cubiertasOtros + (Number(a.leccionesPorSemana) || 0)
                let aviso = null
                if (sugeridas != null) {
                  if (totalConEsta < sugeridas) {
                    aviso = { tono: 'clay', texto: `Faltan ${sugeridas - totalConEsta} lecc. para completar la malla (pide ${sugeridas}).` }
                  } else if (totalConEsta > sugeridas) {
                    aviso = { tono: 'clay', texto: `Hay ${totalConEsta - sugeridas} lecc. de más según la malla (pide ${sugeridas}).` }
                  } else {
                    aviso = { tono: 'sage', texto: `Completa la malla (${sugeridas} lecc./sem.).` }
                  }
                }
                return (
                  <div key={i} className="bg-ink-50 rounded-md p-2.5">
                    <div className="flex items-center gap-2">
                      <Select value={a.grupoId} onChange={e => actualizarAsignacion(i, { grupoId: e.target.value })} className="flex-1">
                        {grupos.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
                      </Select>
                      <Select value={a.materiaId} onChange={e => actualizarAsignacion(i, { materiaId: e.target.value })} className="flex-1">
                        {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </Select>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number" min="1" max="20"
                          value={a.leccionesPorSemana}
                          onChange={e => actualizarAsignacion(i, { leccionesPorSemana: e.target.value })}
                          className="w-16"
                        />
                        <span className="text-xs text-ink-400 whitespace-nowrap">lecc./sem.</span>
                      </div>
                      <button onClick={() => quitarAsignacion(i)} className="text-ink-300 hover:text-clay-600 px-1">✕</button>
                    </div>
                    {aviso && (
                      <p className={`text-xs mt-1.5 ${aviso.tono === 'clay' ? 'text-clay-600' : 'text-sage-600'}`}>{aviso.texto}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mt-6">
        <Button onClick={onGuardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar profesor'}</Button>
        <Button variant="secondary" onClick={onCancelar}>Cancelar</Button>
      </div>
    </Card>
  )
}
