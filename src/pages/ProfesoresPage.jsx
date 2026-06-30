import { useEffect, useState } from 'react'
import {
  listarProfesores, crearProfesor, actualizarProfesor, eliminarProfesor,
  listarGrupos, listarMaterias, listarActividades, obtenerGrilla, obtenerMallas, DIAS,
} from '../lib/datos.js'
import { PageHeader, Button, Card, Input, Select, Spinner, EmptyState, Pill } from '../components/ui.jsx'

const DIAS_LABEL = { lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue', viernes: 'Vie' }
const ANIOS_DISPONIBLES = ['7', '8', '9', '10', '11']

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
  const [actividades, setActividades] = useState([])
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
      const [profs, gr, mat, act, grilla, malla] = await Promise.all([
        listarProfesores(), listarGrupos(), listarMaterias(), listarActividades(), obtenerGrilla(), obtenerMallas(),
      ])
      setProfesores(profs)
      setGrupos(gr)
      setMaterias(mat)
      setActividades(act)
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
        subtitle="Datos de cada profesor: días libres, preferencias de horario, qué materias da a qué grupos, y actividades del colegio que tenga a cargo."
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
            actividades={actividades}
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
              {profesores.map(p => {
                const cantidadActividades = (p.asignaciones || []).filter(a => a.esActividad).length
                return (
                  <Card key={p.id} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-ink-900">{p.nombre}</p>
                      <p className="text-xs text-ink-400 mt-0.5">
                        {(p.asignaciones || []).length} asignación(es)
                        {cantidadActividades > 0 && ` (incl. ${cantidadActividades} actividad${cantidadActividades > 1 ? 'es' : ''})`}
                        {p.diasNoTrabaja?.length > 0 && ` · No trabaja: ${p.diasNoTrabaja.map(d => DIAS_LABEL[d]).join(', ')}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => empezarEdicion(p)}>Editar</Button>
                      <Button variant="danger" onClick={() => eliminar(p.id)}>Eliminar</Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function FormularioProfesor({ form, setForm, grupos, materias, actividades, bloquesClase, mallas, profesores, editandoId, onGuardar, onCancelar, guardando, esNuevo }) {
  // Bloques nuevos que el usuario está armando y todavía no tienen ninguna
  // sección marcada (por eso no existen aún dentro de form.asignaciones).
  const [bloquesNuevos, setBloquesNuevos] = useState([])

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

  // Igual que la anterior, pero busca directo por año (sin necesitar que ya
  // exista un grupo creado de ese año) — útil para mostrar el aviso de
  // cobertura incluso cuando el año todavía no tiene secciones.
  function leccionesSegunMallaPorAnio(anio, materiaId) {
    const filasAnio = mallas[anio] || []
    const fila = filasAnio.find(f => f.materiaId === materiaId)
    return fila ? Number(fila.leccionesPorSemana) : null
  }

  // Agrupa las asignaciones de MATERIA (no actividades) del profesor en
  // "bloques" visuales: cada bloque es una combinación única de
  // materia+año, con la lista de secciones (grupoId) que tiene marcadas
  // dentro de ese año. Por dentro, cada sección sigue siendo una entrada
  // independiente en form.asignaciones — esto solo las junta para
  // mostrarlas y editarlas de forma más compacta.
  function agruparBloques() {
    const bloques = []
    const indice = {} // `${materiaId}|${anio}` -> índice en `bloques`
    form.asignaciones.forEach(a => {
      if (a.esActividad) return
      const grupo = grupos.find(g => g.id === a.grupoId)
      if (!grupo) return
      const clave = `${a.materiaId}|${grupo.anio}`
      if (!(clave in indice)) {
        indice[clave] = bloques.length
        bloques.push({ materiaId: a.materiaId, anio: grupo.anio, gruposIds: [] })
      }
      bloques[indice[clave]].gruposIds.push(a.grupoId)
    })
    return bloques
  }

  // Bloques existentes (derivados de form.asignaciones) + bloques nuevos
  // (todavía sin ninguna sección marcada) que el usuario está armando.
  const bloquesExistentes = agruparBloques()
  const todosLosBloques = [...bloquesExistentes, ...bloquesNuevos]

  // Las asignaciones de actividad se manejan aparte de los "bloques" de
  // materia (no tienen sección que elegir, solo se marca cuáles
  // actividades tiene el profesor a cargo).
  const actividadesAsignadas = form.asignaciones.filter(a => a.esActividad)
  const idsActividadesAsignadas = new Set(actividadesAsignadas.map(a => a.actividadId))

  // Reconstruye form.asignaciones a partir de los bloques de materia
  // (existentes + nuevos), aplicando las lecciones según la malla de cada
  // año, y actualiza cuáles bloques siguen "vacíos" (sin secciones) para
  // seguir mostrándolos editables. Las asignaciones de actividad se
  // conservan tal cual, sin tocarlas.
  function aplicarBloques(bloquesActualizados) {
    const nuevasAsignacionesMateria = []
    bloquesActualizados.forEach(bloque => {
      bloque.gruposIds.forEach(grupoId => {
        const sugeridas = leccionesSegunMalla(grupoId, bloque.materiaId)
        nuevasAsignacionesMateria.push({ grupoId, materiaId: bloque.materiaId, leccionesPorSemana: sugeridas ?? 0 })
      })
    })
    setBloquesNuevos(bloquesActualizados.filter(b => b.gruposIds.length === 0))
    setForm(f => ({ ...f, asignaciones: [...nuevasAsignacionesMateria, ...f.asignaciones.filter(a => a.esActividad)] }))
  }

  function agregarBloque() {
    if (grupos.length === 0 || materias.length === 0) return
    const materiaId = materias[0].id
    const anio = grupos[0].anio
    setBloquesNuevos(prev => [...prev, { materiaId, anio, gruposIds: [] }])
  }

  function actualizarBloque(indexBloque, cambios) {
    const actualizados = todosLosBloques.map((b, i) => (i === indexBloque ? { ...b, ...cambios } : b))
    // Si cambia la materia o el año, las secciones marcadas ya no tienen sentido -> se limpian
    if ('materiaId' in cambios || 'anio' in cambios) {
      actualizados[indexBloque] = { ...actualizados[indexBloque], gruposIds: [] }
    }
    aplicarBloques(actualizados)
  }

  function toggleSeccionEnBloque(indexBloque, grupoId) {
    const actualizados = todosLosBloques.map((b, i) => {
      if (i !== indexBloque) return b
      const yaEsta = b.gruposIds.includes(grupoId)
      return { ...b, gruposIds: yaEsta ? b.gruposIds.filter(g => g !== grupoId) : [...b.gruposIds, grupoId] }
    })
    aplicarBloques(actualizados)
  }

  function quitarBloque(indexBloque) {
    const actualizados = todosLosBloques.filter((_, i) => i !== indexBloque)
    aplicarBloques(actualizados)
  }

  // Marca/desmarca una actividad para este profesor. No pide cantidad de
  // lecciones acá: esas se toman directo de la ficha de la actividad
  // (igual que las materias toman las suyas de la malla), así que si la
  // actividad cambia después en «Actividades», este profesor la sigue
  // usando actualizada — no hay valor "congelado" que resincronizar acá
  // (eso se hace en HorarioPage al generar, igual que con materias).
  function toggleActividad(actividadId) {
    setForm(f => {
      const yaEsta = f.asignaciones.some(a => a.esActividad && a.actividadId === actividadId)
      if (yaEsta) {
        return { ...f, asignaciones: f.asignaciones.filter(a => !(a.esActividad && a.actividadId === actividadId)) }
      }
      const actividad = actividades.find(a => a.id === actividadId)
      return {
        ...f,
        asignaciones: [
          ...f.asignaciones,
          {
            esActividad: true,
            actividadId,
            leccionesPorSemana: Number(actividad?.leccionesPorSemana) || 0,
            bloqueContinuo: !!actividad?.bloqueContinuo,
            puedeAtravesarAlmuerzo: !!actividad?.puedeAtravesarAlmuerzo,
          },
        ],
      }
    })
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
            <label className="block text-sm font-medium text-ink-700">Materias que imparte</label>
            <button onClick={agregarBloque} className="text-sm font-medium text-sage-700 hover:text-sage-800">+ Agregar materia</button>
          </div>
          <p className="text-xs text-ink-400 mb-3">
            Elegí la materia, el año, y qué secciones de ese año le corresponden. Como cada materia de un grupo la da un solo profesor, las lecciones por semana se toman directo de la malla curricular.
          </p>

          {todosLosBloques.length === 0 ? (
            <p className="text-sm text-ink-400 italic">Sin materias asignadas todavía.</p>
          ) : (
            <div className="space-y-3">
              {todosLosBloques.map((bloque, i) => {
                const seccionesDelAnio = grupos.filter(g => g.anio === bloque.anio).sort((a, b) => Number(a.seccion) - Number(b.seccion))
                const leccionesPorSemana = leccionesSegunMallaPorAnio(bloque.anio, bloque.materiaId)
                const enMalla = leccionesPorSemana != null

                return (
                  <div key={i} className="bg-ink-50 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2.5">
                      <Select value={bloque.materiaId} onChange={e => actualizarBloque(i, { materiaId: e.target.value })} className="flex-1">
                        {materias.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </Select>
                      <Select value={bloque.anio} onChange={e => actualizarBloque(i, { anio: e.target.value })} className="w-28">
                        {ANIOS_DISPONIBLES.map(a => <option key={a} value={a}>{a}° año</option>)}
                      </Select>
                      <button onClick={() => quitarBloque(i)} className="text-ink-300 hover:text-clay-600 px-1 shrink-0">✕</button>
                    </div>

                    {seccionesDelAnio.length === 0 ? (
                      <p className="text-xs text-clay-600">No hay secciones creadas para {bloque.anio}° año todavía.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {seccionesDelAnio.map(g => (
                          <Pill
                            key={g.id}
                            tone="sage"
                            active={bloque.gruposIds.includes(g.id)}
                            onClick={() => toggleSeccionEnBloque(i, g.id)}
                          >
                            {g.nombre}
                          </Pill>
                        ))}
                      </div>
                    )}

                    <p className={`text-xs mt-2 ${enMalla ? 'text-sage-600' : 'text-clay-600'}`}>
                      {enMalla
                        ? `${leccionesPorSemana} lecc./sem. por sección, según la malla de ${bloque.anio}° año.`
                        : `Esta materia no está en la malla curricular de ${bloque.anio}° año — agregala en «Malla curricular» primero.`}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">Actividades del colegio a cargo</label>
          <p className="text-xs text-ink-400 mb-3">
            Tareas que este profesor hace para el colegio (comités, coordinaciones, etc.), no clases. Durante esas lecciones queda ocupado, pero no se le ve a ningún grupo — solo en su propio horario. Las lecciones por semana se toman de la ficha de la actividad.
          </p>
          {actividades.length === 0 ? (
            <p className="text-sm text-ink-400 italic">Todavía no hay actividades creadas — agregalas en «Actividades» primero.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {actividades.map(act => (
                <Pill
                  key={act.id}
                  tone="clay"
                  active={idsActividadesAsignadas.has(act.id)}
                  onClick={() => toggleActividad(act.id)}
                >
                  {act.nombre} ({act.leccionesPorSemana} lecc./sem.)
                </Pill>
              ))}
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
