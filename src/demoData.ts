import type { FinanceData } from './types'

const today = new Date()
const date = (day: number) => `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

export const demoData: FinanceData = {
  transactions: [
    { id: 't1', title: 'Salario', type: 'income', amount: 2450, category: 'Trabajo', date: date(1) },
    { id: 't2', title: 'Supermercado', type: 'expense', amount: 86.45, category: 'Comida', date: date(3) },
    { id: 't3', title: 'Internet', type: 'expense', amount: 39.99, category: 'Hogar', date: date(4) },
    { id: 't4', title: 'Café y almuerzo', type: 'expense', amount: 18.5, category: 'Comida', date: date(6) },
    { id: 't5', title: 'Transporte', type: 'expense', amount: 24, category: 'Transporte', date: date(7) },
    { id: 't6', title: 'Proyecto freelance', type: 'income', amount: 320, category: 'Extra', date: date(9) },
    { id: 't7', title: 'Farmacia', type: 'expense', amount: 27.8, category: 'Salud', date: date(11) },
  ],
  events: [
    { id: 'e1', title: 'Pago de arriendo', date: date(24), kind: 'payment', amount: 520, time: '09:00', location: 'Transferencia', category: 'personal', remind: true },
    { id: 'e2', title: 'Cita con el dentista', date: date(25), kind: 'event', time: '10:30', location: 'Clínica Sonrisa', category: 'health', remind: true },
    { id: 'e3', title: 'Clase de yoga', date: date(27), kind: 'event', time: '18:30', location: 'Estudio Alma', category: 'personal', remind: true },
    { id: 'e4', title: 'Llamada con cliente', date: date(28), kind: 'event', time: '11:00', location: 'Videollamada', category: 'work', remind: true },
  ],
  goals: [
    { id: 'g1', title: 'Fondo de emergencia', category: 'Ahorro', target: 5000, current: 2750, dueDate: `${today.getFullYear()}-12-31`, unit: 'USD' },
    { id: 'g2', title: 'Viaje a la playa', category: 'Experiencias', target: 1200, current: 640, dueDate: `${today.getFullYear()}-10-01`, unit: 'USD' },
    { id: 'g3', title: 'Leer 12 libros', category: 'Personal', target: 12, current: 7, dueDate: `${today.getFullYear()}-12-31`, unit: 'libros' },
  ],
  lists: [
    { id: 'l1', title: 'Frutas y verduras', store: 'Frescos para la semana', items: [
      { id: 'i1', name: 'Aguacates', quantity: 'x3', amount: 6.5, done: true }, { id: 'i2', name: 'Plátanos', quantity: 'x6', amount: 3.2, done: false }, { id: 'i3', name: 'Espinacas', quantity: 'x1 bolsa', amount: 2.9, done: false },
    ] },
    { id: 'l2', title: 'Despensa', store: 'Básicos del hogar', items: [
      { id: 'i5', name: 'Avena', quantity: 'x1', amount: 4.8, done: true }, { id: 'i6', name: 'Café molido', quantity: 'x1', amount: 8.9, done: false }, { id: 'i7', name: 'Leche de avena', quantity: 'x2', amount: 7.6, done: true },
    ] },
  ],
  budgets: [{ month: thisMonth, totalLimit: 1200, categoryLimits: { Comida: 350, Hogar: 600, Transporte: 100, Salud: 150 } }],
}
