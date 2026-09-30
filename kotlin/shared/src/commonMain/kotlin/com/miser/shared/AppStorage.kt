package com.miser.shared

// Local preview only. Firebase adapters will keep the existing per-user schema.
interface AppStorage {
    fun load(): String?
    fun save(json: String)
    fun export(json: String)
}
