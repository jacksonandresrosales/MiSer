package com.miser.shared

import kotlinx.serialization.encodeToString
import kotlin.test.*
import kotlin.time.Instant

class MigrationTest {
    @Test
    fun pickerDatesKeepTheUtcCalendarDay() {
        val september = dateFromPicker(Instant.parse("2026-09-29T00:00:00Z").toEpochMilliseconds())
        assertEquals("2026-09-29", september.toString())
        assertEquals("29/09/2026", readableDate(september.toString()))
        assertEquals("2026-03-01", dateFromPicker(Instant.parse("2026-03-01T00:00:00Z").toEpochMilliseconds()).toString())
    }

    @Test
    fun legacyGoalsAndShoppingImagesSurviveTheKotlinRoundTrip() {
        val original = decodeFinanceData("""
            {"transactions":[{"id":"t1","title":"Café","type":"expense","amount":0.3,"category":"Comida","date":"2026-09-29"}],
             "events":[{"id":"e1","title":"Cita","date":"2026-09-30","kind":"event","remind":true}],
             "goals":[{"id":"g1","title":"Leer","target":12,"current":12,"unit":"libros","category":"Personal","dueDate":"2026-12-31"}],
             "lists":[{"id":"l1","title":"Compra","store":"Tienda","items":[{"id":"i1","name":"Café","done":false,"imageUrl":"data:image/jpeg;base64,example","purchaseLinks":["https://example.com/item"]}]}],
             "budgets":[{"month":"2026-09","totalLimit":1200,"categoryLimits":{"Comida":350}}]}
        """.trimIndent())
        assertTrue(original.goals.single().isCompleted)
        assertEquals(original, inflateRecords(flattenData(original)))
        assertEquals(original, financeJson.decodeFromString<FinanceData>(financeJson.encodeToString(original)))
        assertEquals("goal_mejorar%2Ff%C3%ADsico", recordKey("goal", "mejorar/físico"))
        val edited = original.copy(goals = original.goals.map { it.copy(completed = false) })
        assertFalse(edited.goals.single().isCompleted)
        assertEquals(setOf("goal_g1"), changedRecords(flattenData(original), flattenData(edited)).keys)
        assertEquals("data:image/jpeg;base64,example", edited.lists.single().items.single().imageUrl)
        assertEquals(FinanceData(), decodeFinanceData(financeJson.encodeToString(FinanceData())))
        assertFailsWith<IllegalArgumentException> { decodeFinanceData("{}") }
    }

    @Test
    fun moneyUsesCentsAndRejectsInvalidInputs() {
        assertEquals(0.3, sumMoney(listOf(0.1, 0.2)))
        assertEquals("\$1.200,05", currency(1200.05))
        assertEquals(10.25, validateTransaction("Compra", "expense", "10,25", "Comida", "2026-09-29"))
        assertFailsWith<IllegalArgumentException> { validateTransaction("Compra", "expense", "-1", "Comida", "2026-09-29") }
        assertFailsWith<IllegalArgumentException> { validateTransaction("Compra", "expense", "1.234", "Comida", "2026-09-29") }
        assertFailsWith<IllegalArgumentException> { validateTransaction("Compra", "expense", "1", "Comida", "2026-02-30") }
        assertFailsWith<IllegalArgumentException> { cents(Double.POSITIVE_INFINITY) }
    }
}
