@file:OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class, kotlin.js.ExperimentalWasmJsInterop::class)

package com.miser.web

import androidx.compose.ui.window.ComposeViewport
import androidx.compose.runtime.*
import com.miser.shared.AppStorage
import com.miser.shared.MiserApp

@JsFun("(key) => window.localStorage.getItem(key)")
private external fun readStorage(key: String): String?

@JsFun("(key, value) => window.localStorage.setItem(key, value)")
private external fun writeStorage(key: String, value: String)

@JsFun("(callback) => { const query = window.matchMedia('(prefers-reduced-motion: reduce)'); const changed = () => callback(query.matches); changed(); query.addEventListener('change', changed); return () => query.removeEventListener('change', changed); }")
private external fun observeReducedMotion(callback: (Boolean) -> Unit): () -> Unit

@JsFun("""(json) => {
    const url = URL.createObjectURL(new Blob([json], {type: 'application/json'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'miser-datos.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}""")
private external fun download(json: String)

fun main() {
    val storage = object : AppStorage {
        override fun load(): String? = readStorage("miser-kotlin-demo") ?: readStorage("miser-demo")
        override fun save(json: String) = writeStorage("miser-kotlin-demo", json)
        override fun export(json: String) = download(json)
    }
    ComposeViewport("miser") {
        var reducedMotion by remember { mutableStateOf(false) }
        DisposableEffect(Unit) {
            val stop = observeReducedMotion { reducedMotion = it }
            onDispose { stop() }
        }
        MiserApp(storage, reducedMotion = reducedMotion)
    }
}
