package com.miser.shared

import kotlinx.datetime.LocalDate
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import kotlin.math.abs
import kotlin.math.floor

val financeJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    encodeDefaults = true
}

fun decodeFinanceData(json: String): FinanceData {
    val objectData = financeJson.parseToJsonElement(json).jsonObject
    val collections = setOf("transactions", "events", "goals", "lists", "budgets")
    require(objectData.keys == collections && collections.all { objectData[it] is JsonArray }) {
        "La copia no tiene el formato de datos de MiSer."
    }
    return financeJson.decodeFromJsonElement<FinanceData>(objectData)
}

@Serializable
data class Transaction(
    val id: String, val title: String, val type: String, val amount: Double,
    val category: String, val date: String, val note: String? = null,
)

@Serializable
data class CalendarEvent(
    val id: String, val title: String, val date: String, val kind: String,
    val remind: Boolean, val amount: Double? = null, val note: String? = null,
    val time: String? = null, val location: String? = null, val category: String? = null,
)

@Serializable
data class AnnualGoal(
    val id: String, val title: String, val completed: Boolean? = null,
    val category: String? = null, val target: Double? = null, val current: Double? = null,
    val dueDate: String? = null, val unit: String? = null,
) {
    val isCompleted: Boolean get() = completed ?: (current != null && target != null && current >= target)
}

@Serializable
data class ShoppingItem(
    val id: String, val name: String, val done: Boolean,
    val description: String? = null, val amount: Double? = null, val quantity: String? = null,
    val imageUrl: String? = null, val purchaseLinks: List<String>? = null,
)

@Serializable
data class ShoppingList(val id: String, val title: String, val store: String, val items: List<ShoppingItem>)

@Serializable
data class Budget(val month: String, val totalLimit: Double, val categoryLimits: Map<String, Double>)

@Serializable
data class FinanceData(
    val transactions: List<Transaction> = emptyList(),
    val events: List<CalendarEvent> = emptyList(),
    val goals: List<AnnualGoal> = emptyList(),
    val lists: List<ShoppingList> = emptyList(),
    val budgets: List<Budget> = emptyList(),
)

@Serializable
data class FinanceRecord(val kind: String, val value: JsonObject)

// Match src/financeData.ts and JavaScript's encodeURIComponent, including UTF-8.
fun recordKey(kind: String, id: String): String = kind + "_" + buildString {
    val unescaped = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
    for (byte in id.encodeToByteArray()) {
        val value = byte.toInt() and 255
        if (value.toChar() in unescaped) append(value.toChar())
        else append('%').append(value.toString(16).uppercase().padStart(2, '0'))
    }
}

fun flattenData(data: FinanceData): Map<String, FinanceRecord> = buildMap {
    fun add(kind: String, id: String, value: JsonObject) { put(recordKey(kind, id), FinanceRecord(kind, value)) }
    data.transactions.forEach { add("transaction", it.id, financeJson.encodeToJsonElement(it).jsonObject) }
    data.events.forEach { add("event", it.id, financeJson.encodeToJsonElement(it).jsonObject) }
    data.goals.forEach { add("goal", it.id, financeJson.encodeToJsonElement(it).jsonObject) }
    data.budgets.forEach { add("budget", it.month, financeJson.encodeToJsonElement(it).jsonObject) }
    data.lists.forEachIndexed { position, list ->
        val details = financeJson.encodeToJsonElement(list).jsonObject - "items"
        add("list", list.id, JsonObject(details + ("position" to JsonPrimitive(position))))
        list.items.forEachIndexed { itemPosition, item ->
            val value = financeJson.encodeToJsonElement(item).jsonObject
            add("item", item.id, JsonObject(value + mapOf("listId" to JsonPrimitive(list.id), "position" to JsonPrimitive(itemPosition))))
        }
    }
}

fun inflateRecords(records: Map<String, FinanceRecord>): FinanceData {
    val transactions = mutableListOf<Transaction>()
    val events = mutableListOf<CalendarEvent>()
    val goals = mutableListOf<AnnualGoal>()
    val budgets = mutableListOf<Budget>()
    val lists = mutableListOf<Pair<Int, ShoppingList>>()
    val items = mutableMapOf<String, MutableList<Pair<Int, ShoppingItem>>>()
    for (record in records.values) {
        val value = record.value
        when (record.kind) {
            "transaction" -> transactions += financeJson.decodeFromJsonElement<Transaction>(value)
            "event" -> events += financeJson.decodeFromJsonElement<CalendarEvent>(value)
            "goal" -> goals += financeJson.decodeFromJsonElement<AnnualGoal>(value)
            "budget" -> budgets += financeJson.decodeFromJsonElement<Budget>(value)
            "list" -> {
                val details = JsonObject(value + ("items" to JsonArray(emptyList())))
                lists += (value["position"]?.jsonPrimitive?.int ?: 0) to financeJson.decodeFromJsonElement<ShoppingList>(details)
            }
            "item" -> {
                val listId = value.getValue("listId").jsonPrimitive.content
                items.getOrPut(listId) { mutableListOf() } +=
                    (value["position"]?.jsonPrimitive?.int ?: 0) to financeJson.decodeFromJsonElement<ShoppingItem>(value)
            }
            else -> error("Tipo de registro desconocido: ${record.kind}")
        }
    }
    return FinanceData(transactions, events, goals,
        lists.sortedBy { it.first }.map { (_, list) -> list.copy(items = items[list.id].orEmpty().sortedBy { it.first }.map { it.second }) },
        budgets)
}

fun changedRecords(before: Map<String, FinanceRecord>, after: Map<String, FinanceRecord>): Map<String, FinanceRecord?> = buildMap {
    after.forEach { (key, record) -> if (before[key] != record) put(key, record) }
    before.keys.filter { it !in after }.forEach { put(it, null) }
}

fun cents(amount: Double): Long {
    require(amount.isFinite() && abs(amount * 100) <= 9_007_199_254_740_991.0) { "El importe está fuera de rango." }
    return floor(amount * 100 + 0.5).toLong()
}

fun sumMoney(amounts: List<Double>): Double = amounts.sumOf(::cents) / 100.0

fun currency(amount: Double): String {
    val value = cents(amount)
    val whole = (abs(value) / 100).toString().reversed().chunked(3).joinToString(".").reversed()
    return "${if (value < 0) "-" else ""}\$$whole,${(abs(value) % 100).toString().padStart(2, '0')}"
}

fun validateTransaction(title: String, type: String, amount: String, category: String, date: String): Double {
    require(title.isNotBlank()) { "Escribe el nombre del movimiento." }
    require(type == "income" || type == "expense") { "Elige ingreso o gasto." }
    require(category.isNotBlank()) { "Escribe una categoría." }
    require(Regex("\\d+(?:[.,]\\d{1,2})?").matches(amount.trim())) { "Escribe un importe con hasta dos decimales." }
    val parsed = amount.trim().replace(',', '.').toDouble()
    require(parsed > 0) { "El importe debe ser mayor que cero." }
    cents(parsed)
    require(runCatching { LocalDate.parse(date).toString() == date }.getOrDefault(false)) { "Escribe una fecha válida: AAAA-MM-DD." }
    return parsed
}

fun demoData(today: String): FinanceData {
    val month = today.take(7)
    return FinanceData(
        transactions = listOf(
            Transaction("t1", "Salario", "income", 2450.0, "Trabajo", "$month-01"),
            Transaction("t2", "Supermercado", "expense", 86.45, "Comida", "$month-03"),
            Transaction("t3", "Internet", "expense", 39.99, "Hogar", "$month-04"),
            Transaction("t4", "Café y almuerzo", "expense", 18.5, "Comida", "$month-06"),
            Transaction("t5", "Transporte", "expense", 24.0, "Transporte", "$month-07"),
            Transaction("t6", "Proyecto freelance", "income", 320.0, "Extra", "$month-09"),
            Transaction("t7", "Farmacia", "expense", 27.8, "Salud", "$month-11"),
        ),
        events = listOf(CalendarEvent("e1", "Pago de arriendo", "$month-24", "payment", true, amount = 520.0)),
        goals = listOf(AnnualGoal("g1", "Mejorar mi físico", false), AnnualGoal("g2", "Leer más libros", false), AnnualGoal("g3", "Ahorrar cada mes", true)),
        budgets = listOf(Budget(month, 1200.0, mapOf("Comida" to 350.0, "Hogar" to 600.0))),
    )
}
