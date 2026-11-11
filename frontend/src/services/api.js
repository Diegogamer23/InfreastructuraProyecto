import { fetchAuthSession } from 'aws-amplify/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '')

export async function apiRequest(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error('Falta VITE_API_BASE_URL en frontend/.env.local.')
  }

  const session = await fetchAuthSession()
  const token = session.tokens?.idToken?.toString()
  if (!token) throw new Error('La sesión venció. Inicia sesión nuevamente.')

  const headers = { Authorization: `Bearer ${token}` }
  if (options.body) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body,
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload.message || `La API respondió ${response.status}.`)
  }
  return payload
}

export async function listTransactions() {
  const result = await apiRequest('/transactions')
  return Array.isArray(result.transactions) ? result.transactions : []
}

export function createTransaction(transaction) {
  return apiRequest('/transactions', {
    method: 'POST',
    body: JSON.stringify(transaction),
  })
}

export async function listBudgets(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : ''
  const result = await apiRequest(`/budgets${query}`)
  return Array.isArray(result.budgets) ? result.budgets : []
}

export function saveBudget(budget) {
  return apiRequest('/budgets', {
    method: 'POST',
    body: JSON.stringify(budget),
  })
}

export async function listCards() {
  const result = await apiRequest('/cards')
  return Array.isArray(result.cards) ? result.cards : []
}

export function saveCard(card) {
  return apiRequest('/cards', {
    method: 'POST',
    body: JSON.stringify(card),
  })
}

export async function listGoals() {
  const result = await apiRequest('/goals')
  return Array.isArray(result.goals) ? result.goals : []
}

export function saveGoal(goal) {
  return apiRequest('/goals', {
    method: 'POST',
    body: JSON.stringify(goal),
  })
}

export async function getNotifications() {
  const result = await apiRequest('/notifications')
  return Array.isArray(result.notices) ? result.notices : []
}

export function getMonthlyReport(month) {
  return apiRequest(`/reports/monthly?month=${encodeURIComponent(month)}`)
}
