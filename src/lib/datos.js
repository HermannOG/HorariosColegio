import { db } from './firebase'
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, orderBy,
} from 'firebase/firestore'

// ---------- CONFIGURACIÓN (grilla de bloques del día) ----------
// Documento único: config/grilla
// { bloques: [{ id, numero, horaInicio, horaFin, tipo: 'clase'|'recreo'|'almuerzo' }] }

const DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes']

const grillaPorDefecto = () => ([
  { id: 'b1', numero: '1°', horaInicio: '07:00', horaFin: '07:40', tipo: 'clase' },
  { id: 'b2', numero: '2°', horaInicio: '07:40', horaFin: '08:20', tipo: 'clase' },
  { id: 'r1', numero: '', horaInicio: '08:20', horaFin: '08:35', tipo: 'recreo', etiqueta: 'Recreo' },
  { id: 'b3', numero: '3°', horaInicio: '08:35', horaFin: '09:15', tipo: 'clase' },
  { id: 'b4', numero: '4°', horaInicio: '09:15', horaFin: '09:55', tipo: 'clase' },
  { id: 'r2', numero: '', horaInicio: '09:55', horaFin: '10:10', tipo: 'recreo', etiqueta: 'Recreo' },
  { id: 'b5', numero: '5°', horaInicio: '10:10', horaFin: '10:50', tipo: 'clase' },
  { id: 'b6', numero: '6°', horaInicio: '10:50', horaFin: '11:30', tipo: 'clase' },
  { id: 'a1', numero: '', horaInicio: '11:30', horaFin: '12:10', tipo: 'almuerzo', etiqueta: 'Almuerzo' },
  { id: 'b7', numero: '7°', horaInicio: '12:10', horaFin: '12:50', tipo: 'clase' },
  { id: 'b8', numero: '8°', horaInicio: '12:50', horaFin: '13:30', tipo: 'clase' },
  { id: 'r3', numero: '', horaInicio: '13:30', horaFin: '13:40', tipo: 'recreo', etiqueta: 'Recreo' },
  { id: 'b9', numero: '9°', horaInicio: '13:40', horaFin: '14:20', tipo: 'clase' },
  { id: 'b10', numero: '10°', horaInicio: '14:20', horaFin: '15:00', tipo: 'clase' },
  { id: 'r4', numero: '', horaInicio: '15:00', horaFin: '15:10', tipo: 'recreo', etiqueta: 'Recreo' },
  { id: 'b11', numero: '11°', horaInicio: '15:10', horaFin: '15:50', tipo: 'clase' },
  { id: 'b12', numero: '12°', horaInicio: '15:50', horaFin: '16:30', tipo: 'clase' },
])

export async function obtenerGrilla() {
  const ref = doc(db, 'config', 'grilla')
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const inicial = { bloques: grillaPorDefecto(), dias: DIAS }
    await setDoc(ref, inicial)
    return inicial
  }
  return snap.data()
}

export async function guardarGrilla(bloques) {
  const ref = doc(db, 'config', 'grilla')
  await setDoc(ref, { bloques, dias: DIAS }, { merge: true })
}

export { DIAS }

// ---------- MATERIAS ----------
export async function listarMaterias() {
  const snap = await getDocs(query(collection(db, 'materias'), orderBy('nombre')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearMateria(nombre) {
  return addDoc(collection(db, 'materias'), { nombre })
}

export async function eliminarMateria(id) {
  return deleteDoc(doc(db, 'materias', id))
}

// ---------- GRUPOS ----------
// { nombre: '9-2', anio: '9', seccion: '2' }
export async function listarGrupos() {
  const snap = await getDocs(query(collection(db, 'grupos'), orderBy('nombre')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearGrupo(grupo) {
  return addDoc(collection(db, 'grupos'), grupo)
}

export async function eliminarGrupo(id) {
  return deleteDoc(doc(db, 'grupos', id))
}

// ---------- MALLA CURRICULAR (por año) ----------
// Documento único: mallas/porAnio
// { '7': [{ materiaId, leccionesPorSemana }], '8': [...], '9': [...], '10': [...], '11': [...] }
export async function obtenerMallas() {
  const ref = doc(db, 'mallas', 'porAnio')
  const snap = await getDoc(ref)
  if (!snap.exists()) {
    const inicial = { '7': [], '8': [], '9': [], '10': [], '11': [] }
    await setDoc(ref, inicial)
    return inicial
  }
  return snap.data()
}

export async function guardarMalla(anio, materiasDelAnio) {
  const ref = doc(db, 'mallas', 'porAnio')
  await setDoc(ref, { [anio]: materiasDelAnio }, { merge: true })
}

// ---------- PROFESORES ----------
// {
//   nombre: 'Heidi Ruiz Víquez',
//   diasNoTrabaja: ['viernes'],
//   bloquesPreferidos: ['b1','b2'],   // ids de bloque preferidos
//   bloquesEvitados: ['b11','b12'],   // ids de bloque a evitar
//   asignaciones: [
//     { grupoId, materiaId, leccionesPorSemana: 4 }
//   ]
// }
export async function listarProfesores() {
  const snap = await getDocs(query(collection(db, 'profesores'), orderBy('nombre')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function crearProfesor(profesor) {
  return addDoc(collection(db, 'profesores'), profesor)
}

export async function actualizarProfesor(id, datos) {
  return updateDoc(doc(db, 'profesores', id), datos)
}

export async function eliminarProfesor(id) {
  return deleteDoc(doc(db, 'profesores', id))
}

// ---------- HORARIO GENERADO ----------
// Documento único: horarios/actual
// { asignaciones: [{ profesorId, grupoId, materiaId, dia, bloqueId }], conflictos: [...] }
export async function obtenerHorarioActual() {
  const ref = doc(db, 'horarios', 'actual')
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : { asignaciones: [], conflictos: [], generadoEn: null }
}

export async function guardarHorario(data) {
  const ref = doc(db, 'horarios', 'actual')
  await setDoc(ref, data)
}
