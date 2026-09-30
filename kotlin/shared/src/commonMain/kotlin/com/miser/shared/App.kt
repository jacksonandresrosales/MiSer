@file:OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class, kotlin.uuid.ExperimentalUuidApi::class)

package com.miser.shared

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import kotlinx.coroutines.launch
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlinx.serialization.encodeToString
import kotlin.time.Clock
import kotlin.time.Instant
import kotlin.uuid.Uuid

enum class Screen(val label: String, val icon: ImageVector) {
    Summary("Resumen", Icons.Default.Home),
    Transactions("Finanzas", Icons.AutoMirrored.Filled.List),
    Goals("Objetivos", Icons.Default.CheckCircle),
}

private val lightColors = lightColorScheme(
    primary = Color(0xFF6551C6), onPrimary = Color.White,
    primaryContainer = Color(0xFFEEE9FC), onPrimaryContainer = Color(0xFF30245D),
    background = Color(0xFFF8F7F2), onBackground = Color(0xFF1E293B),
    surface = Color(0xFFFFFEFB), onSurface = Color(0xFF1E293B),
    surfaceVariant = Color(0xFFEFEDF4), onSurfaceVariant = Color(0xFF5E6574),
)
private val darkColors = darkColorScheme(
    primary = Color(0xFFC6B7FF), onPrimary = Color(0xFF30245D),
    primaryContainer = Color(0xFF352C51), onPrimaryContainer = Color(0xFFEBE4FF),
    background = Color(0xFF10131B), onBackground = Color(0xFFE6E8EF),
    surface = Color(0xFF191D28), onSurface = Color(0xFFE6E8EF),
    surfaceVariant = Color(0xFF282D3A), onSurfaceVariant = Color(0xFFB9C1D0),
)

@Composable
fun MiserApp(storage: AppStorage, screen: MutableState<Screen> = remember { mutableStateOf(Screen.Summary) }, reducedMotion: Boolean = false) {
    val today = remember { Clock.System.now().toLocalDateTime(TimeZone.currentSystemDefault()).date.toString() }
    val initial = remember(storage) { runCatching { storage.load()?.let(::decodeFinanceData) ?: demoData(today) } }
    var data by remember { mutableStateOf(initial.getOrNull()) }
    var error by remember { mutableStateOf(if (initial.isFailure) "No pudimos leer tu copia local. Puedes exportarla y conservarla." else null) }
    val systemDark = isSystemInDarkTheme()
    var dark by rememberSaveable { mutableStateOf(systemDark) }
    var editingTransactionId by rememberSaveable { mutableStateOf<String?>(null) }
    val editingTransaction = data?.transactions?.find { it.id == editingTransactionId }
    var transactionDialog by rememberSaveable { mutableStateOf(false) }
    var editingGoalId by rememberSaveable { mutableStateOf<String?>(null) }
    val editingGoal = data?.goals?.find { it.id == editingGoalId }
    var deletingGoal by remember { mutableStateOf<AnnualGoal?>(null) }
    var deletingTransaction by remember { mutableStateOf<Transaction?>(null) }
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val screenState = rememberSaveableStateHolder()

    fun update(next: FinanceData): Boolean = try {
        storage.save(financeJson.encodeToString(next))
        data = next
        error = null
        true
    } catch (_: Throwable) {
        error = "No pudimos guardar el cambio. Reintenta o exporta una copia antes de salir."
        false
    }
    fun export() {
        try { storage.export(data?.let { financeJson.encodeToString(it) } ?: storage.load().orEmpty()) }
        catch (_: Throwable) { error = "No pudimos exportar la copia. Inténtalo de nuevo." }
    }

    CompositionLocalProvider(LocalReducedMotion provides reducedMotion) {
    MaterialTheme(colorScheme = if (dark) darkColors else lightColors) {
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val compact = maxWidth < 720.dp
            val colors = MaterialTheme.colorScheme
            val pageDuration = motionDuration(250)
            val exitDuration = motionDuration(150)
            val pageDistance = with(LocalDensity.current) { 8.dp.roundToPx() }
            Canvas(Modifier.fillMaxSize().background(colors.background)) {
                drawRect(Brush.radialGradient(listOf(colors.primary.copy(alpha = .07f), Color.Transparent), center = Offset(size.width, 0f), radius = 420.dp.toPx()))
            }
            Scaffold(
                containerColor = Color.Transparent,
                contentColor = colors.onBackground,
                snackbarHost = { SnackbarHost(snackbar) },
                topBar = {
                    TopAppBar(
                        title = { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { BrandMark(); Text("MiSer", fontWeight = FontWeight.Bold) } },
                        actions = {
                            Row(Modifier.padding(end = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                GlassIconButton(if (dark) Icons.Default.LightMode else Icons.Default.DarkMode, "Cambiar tema", { dark = !dark })
                                GlassIconButton(Icons.Default.Download, "Exportar copia JSON", ::export)
                            }
                        },
                        colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
                    )
                },
                bottomBar = {
                    if (compact) GlassNavigation(screen.value) { screen.value = it }
                },
            ) { insets ->
                Row(Modifier.padding(insets).fillMaxSize()) {
                    if (!compact) NavigationRail(Modifier.fillMaxHeight()) {
                        Spacer(Modifier.height(24.dp))
                        Screen.entries.forEach { destination -> NavigationRailItem(
                            selected = destination == screen.value, onClick = { screen.value = destination },
                            icon = { Icon(destination.icon, null) }, label = { Text(destination.label) },
                            modifier = Modifier.padding(vertical = 8.dp),
                        ) }
                    }
                    Box(Modifier.weight(1f).fillMaxHeight(), contentAlignment = Alignment.TopCenter) {
                        Column(Modifier.widthIn(max = 1050.dp).fillMaxSize().padding(horizontal = if (compact) 16.dp else 32.dp)) {
                            Text("Vista previa · Guardado en este dispositivo", Modifier.padding(top = 12.dp, bottom = 8.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            error?.let { message ->
                                Surface(color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(12.dp)) {
                                    Column(Modifier.padding(16.dp)) {
                                        Text(message, color = MaterialTheme.colorScheme.onErrorContainer)
                                        Row { TextButton(onClick = ::export) { Text("Exportar copia") }; TextButton(onClick = {
                                            if (data != null) error = null
                                            else runCatching { storage.load()?.let(::decodeFinanceData) ?: demoData(today) }.onSuccess { data = it; error = null }
                                        }) { Text(if (data == null) "Reintentar" else "Cerrar aviso") } }
                                    }
                                }
                            }
                            data?.let { current -> AnimatedContent(
                                targetState = screen.value, modifier = Modifier.weight(1f),
                                transitionSpec = {
                                    val direction = if (targetState.ordinal > initialState.ordinal) 1 else -1
                                    (fadeIn(tween(pageDuration)) + slideInHorizontally(tween(pageDuration, easing = SmoothOut)) { pageDistance * direction })
                                        .togetherWith(fadeOut(tween(exitDuration)))
                                }, label = "Cambio de pantalla",
                            ) { destination -> screenState.SaveableStateProvider(destination) { when (destination) {
                                Screen.Summary -> SummaryScreen(current, today, dark, { editingTransactionId = null; transactionDialog = true }, { screen.value = it })
                                Screen.Transactions -> TransactionsScreen(current, today, { editingTransactionId = it?.id; transactionDialog = true }, { deletingTransaction = it })
                                Screen.Goals -> GoalsScreen(current,
                                    onAdd = { title -> update(current.copy(goals = current.goals + AnnualGoal(Uuid.random().toString(), title.trim(), false))) },
                                    onToggle = { goal -> if (update(current.copy(goals = current.goals.map { if (it.id == goal.id) it.copy(completed = !goal.isCompleted) else it }))) {
                                        scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar(if (goal.isCompleted) "Objetivo pendiente" else "¡Objetivo cumplido!") }
                                    } },
                                    onEdit = { editingGoalId = it.id }, onDelete = { deletingGoal = it },
                                )
                            } } } }
                        }
                    }
                }
            }
        }
        if (transactionDialog) TransactionDialog(editingTransaction, today, { transactionDialog = false }) { transaction ->
            val current = data ?: return@TransactionDialog false
            val transactions = if (editingTransaction == null) current.transactions + transaction else current.transactions.map { if (it.id == transaction.id) transaction else it }
            update(current.copy(transactions = transactions)).also { if (it) {
                transactionDialog = false
                scope.launch { snackbar.currentSnackbarData?.dismiss(); snackbar.showSnackbar("Movimiento guardado") }
            } }
        }
        editingGoal?.let { goal -> GoalDialog(goal, { editingGoalId = null }) { title ->
            val current = data ?: return@GoalDialog false
            update(current.copy(goals = current.goals.map { if (it.id == goal.id) it.copy(title = title.trim()) else it })).also { if (it) editingGoalId = null }
        } }
        deletingGoal?.let { goal -> ConfirmDelete(goal.title, { deletingGoal = null }) {
            data?.let { if (update(it.copy(goals = it.goals.filter { item -> item.id != goal.id }))) deletingGoal = null }
        } }
        deletingTransaction?.let { transaction -> ConfirmDelete(transaction.title, { deletingTransaction = null }) {
            data?.let { if (update(it.copy(transactions = it.transactions.filter { item -> item.id != transaction.id }))) deletingTransaction = null }
        } }
    } }
}

@Composable
private fun BrandMark() {
    Canvas(Modifier.size(40.dp).semantics { contentDescription = "Logo de MiSer" }) {
        withTransform({ scale(size.width / 48, size.height / 48, Offset.Zero) }) {
            drawRoundRect(Color(0xFFF6A8BC), Offset(6f, 6f), Size(39f, 39f), CornerRadius(12f))
            drawRoundRect(Color(0xFF1E293B), Offset(2f, 2f), Size(39f, 39f), CornerRadius(12f))
            drawPath(Path().apply { moveTo(10f, 29f); lineTo(10f, 14f); lineTo(18f, 23f); lineTo(26f, 14f); lineTo(26f, 29f) }, Color.White, style = Stroke(3.7f))
            drawPath(Path().apply { moveTo(28f, 28f); cubicTo(31.5f, 26.5f, 33.5f, 24.1f, 34f, 20.8f) }, Color(0xFFB8F3C9), style = Stroke(2.8f))
            drawCircle(Color(0xFFFFDC72), 3.25f, Offset(32.5f, 12.5f))
        }
    }
}

@Composable
private fun SummaryScreen(data: FinanceData, today: String, dark: Boolean, onAdd: () -> Unit, onNavigate: (Screen) -> Unit) {
    val month = today.take(7)
    val expenses = sumMoney(data.transactions.filter { it.type == "expense" && it.date.startsWith(month) }.map { it.amount })
    val budget = data.budgets.find { it.month == month }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(18.dp), contentPadding = PaddingValues(bottom = 24.dp)) {
        item { Text("Hola, qué bueno verte", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        item {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(24.dp)).background(Brush.linearGradient(if (dark) listOf(Color(0xFF39305F), Color(0xFF754362)) else listOf(Color(0xFF6656D0), Color(0xFFAA557C))))) {
                Canvas(Modifier.matchParentSize()) {
                    drawCircle(Color.White.copy(alpha = .1f), 115.dp.toPx(), Offset(size.width - 30.dp.toPx(), 12.dp.toPx()), style = Stroke(23.dp.toPx()))
                    val orbitCenter = Offset(size.width - 135.dp.toPx(), size.height)
                    withTransform({ rotate(40f, orbitCenter) }) {
                        drawRoundRect(Color.White.copy(alpha = .1f), Offset(size.width - 200.dp.toPx(), size.height - 60.dp.toPx()), Size(130.dp.toPx(), 130.dp.toPx()), CornerRadius(32.dp.toPx()), style = Stroke(23.dp.toPx()))
                    }
                }
                Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("Gastos de ${monthNames[month.takeLast(2).toInt() - 1]}", color = Color.White, style = MaterialTheme.typography.titleMedium)
                    Text(currency(expenses), color = Color.White, fontSize = 42.sp, fontWeight = FontWeight.Bold)
                    GlassButton("Añadir movimiento", onAdd, Modifier.widthIn(max = 360.dp).fillMaxWidth(), icon = Icons.Default.Add, onColor = true)
                    if (budget != null && budget.totalLimit > 0) {
                        LinearProgressIndicator(progress = { (expenses / budget.totalLimit).coerceIn(0.0, 1.0).toFloat() }, modifier = Modifier.fillMaxWidth(), color = Color(0xFFC2F0D2), trackColor = Color.White.copy(alpha = .25f))
                        Text("Presupuesto: ${currency(budget.totalLimit)}", color = Color.White, style = MaterialTheme.typography.bodySmall)
                        Text(if (expenses <= budget.totalLimit) "Te quedan ${currency(budget.totalLimit - expenses)}" else "Superaste el límite por ${currency(expenses - budget.totalLimit)}", color = Color.White, fontWeight = FontWeight.SemiBold)
                    } else Text("Sin límite mensual configurado.", color = Color.White, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        item { QuoteCard() }
        item {
            Surface(Modifier.fillMaxWidth(), color = MaterialTheme.colorScheme.surface, shape = RoundedCornerShape(16.dp)) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Próximamente", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    val event = data.events.filter { it.date >= today }.minByOrNull { it.date }
                    Text(event?.let { "${it.title} · ${readableDate(it.date)}" } ?: "Sin eventos próximos", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    val goal = data.goals.find { !it.isCompleted }
                    TextButton(onClick = { onNavigate(Screen.Goals) }) { Text(goal?.title ?: "Ver mis objetivos") }
                }
            }
        }
        item { Row(verticalAlignment = Alignment.CenterVertically) { Text("Movimientos recientes", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold); TextButton(onClick = { onNavigate(Screen.Transactions) }) { Text("Ver todo") } } }
        if (data.transactions.isEmpty()) item { Text("Aún no tienes movimientos. Añade el primero.") }
        items(data.transactions.sortedByDescending { it.date }.take(3), key = { it.id }) { TransactionRow(it) }
    }
}

@Composable
private fun QuoteCard() {
    val quotes = listOf(
        "Unas cosas dependen de nosotros; otras, no." to "Epicteto · Manual, 1",
        "En ninguna parte se encuentra un retiro más tranquilo que en la propia alma." to "Marco Aurelio · Meditaciones, IV.3",
        "Una vida sin examen no merece ser vivida." to "Sócrates · En Platón, Apología, 38a",
        "A menudo nos inquieta más lo que suponemos que lo que realmente ocurre." to "Séneca · Cartas a Lucilio, 13",
    )
    var index by rememberSaveable { mutableStateOf(0) }
    val duration = motionDuration(150)
    Surface(Modifier.fillMaxWidth().animateContentSize(tween(motionDuration(250), easing = SmoothOut)), color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(20.dp)) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            AnimatedContent(index, transitionSpec = { fadeIn(tween(duration)).togetherWith(fadeOut(tween(duration))) }, label = "Otra frase") { quoteIndex ->
                Text("“${quotes[quoteIndex].first}”", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(quotes[index].second, Modifier.weight(1f), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
                Spacer(Modifier.width(8.dp))
                GlassIconButton(Icons.Default.Refresh, "Otra frase", { index = (index + 1) % quotes.size })
            }
        }
    }
}

@Composable
private fun GoalsScreen(data: FinanceData, onAdd: (String) -> Boolean, onToggle: (AnnualGoal) -> Unit, onEdit: (AnnualGoal) -> Unit, onDelete: (AnnualGoal) -> Unit) {
    var title by rememberSaveable { mutableStateOf("") }
    val focus = LocalFocusManager.current
    val reducedMotion = LocalReducedMotion.current
    fun add() { if (title.isNotBlank() && onAdd(title)) { title = ""; focus.clearFocus() } }
    LazyColumn(Modifier.fillMaxSize().imePadding(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Mis objetivos", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
            Text("${data.goals.count { it.isCompleted }} de ${data.goals.size} cumplidos", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            Column(Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(title, { title = it }, Modifier.fillMaxWidth(), label = { Text("¿Qué quieres lograr?") }, placeholder = { Text("Mejorar mi físico") }, singleLine = true,
                    shape = RoundedCornerShape(16.dp), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { add() }))
                GlassButton("Añadir objetivo", ::add, Modifier.fillMaxWidth(), Icons.Default.Add, enabled = title.isNotBlank())
            }
        }
        if (data.goals.isEmpty()) item { EmptyState("Un objetivo, un primer paso", "Escribe algo que quieras lograr este año y márcalo cuando lo cumplas.", Icons.Default.CheckCircleOutline) }
        items(data.goals, key = { it.id }) { goal ->
            val background by animateColorAsState(if (goal.isCompleted) MaterialTheme.colorScheme.primaryContainer.copy(alpha = .45f) else MaterialTheme.colorScheme.surface, tween(motionDuration(250)))
            Surface(Modifier.animateItem(fadeInSpec = if (reducedMotion) null else tween(250), fadeOutSpec = if (reducedMotion) null else tween(150), placementSpec = if (reducedMotion) null else tween(250, easing = SmoothOut)).fillMaxWidth(), shape = RoundedCornerShape(16.dp), color = background) {
                Row(Modifier.padding(end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Row(Modifier.weight(1f).heightIn(min = 76.dp).toggleable(value = goal.isCompleted, role = Role.Checkbox, onValueChange = { onToggle(goal) }).padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        Checkbox(goal.isCompleted, onCheckedChange = null)
                        Text(goal.title, textDecoration = if (goal.isCompleted) TextDecoration.LineThrough else null, color = if (goal.isCompleted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.Medium)
                    }
                    RecordMenu(goal.title, { onEdit(goal) }, { onDelete(goal) })
                }
            }
        }
    }
}

@Composable
private fun TransactionsScreen(data: FinanceData, today: String, onEdit: (Transaction?) -> Unit, onDelete: (Transaction) -> Unit) {
    var search by rememberSaveable { mutableStateOf("") }
    val month = today.take(7)
    val reducedMotion = LocalReducedMotion.current
    val income = sumMoney(data.transactions.filter { it.type == "income" && it.date.startsWith(month) }.map { it.amount })
    val expenses = sumMoney(data.transactions.filter { it.type == "expense" && it.date.startsWith(month) }.map { it.amount })
    val visible = data.transactions.filter { it.title.contains(search, true) || it.category.contains(search, true) }.sortedByDescending { it.date }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item {
            Text("Mis finanzas", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp, bottom = 8.dp))
            Text("Saldo del mes", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
            Text(currency(income - expenses), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 4.dp))
            Row(Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text("Ingresos", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(currency(income), fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.primary) }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) { Text("Gastos", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(currency(expenses), fontWeight = FontWeight.SemiBold) }
            }
            GlassButton("Añadir movimiento", { onEdit(null) }, Modifier.fillMaxWidth().padding(vertical = 20.dp), Icons.Default.Add)
            OutlinedTextField(search, { search = it }, Modifier.fillMaxWidth(), label = { Text("Buscar movimientos") }, placeholder = { Text("Nombre o categoría") }, singleLine = true, shape = RoundedCornerShape(16.dp),
                leadingIcon = { Icon(Icons.Default.Search, null) }, trailingIcon = { if (search.isNotEmpty()) IconButton(onClick = { search = "" }) { Icon(Icons.Default.Close, "Borrar búsqueda") } })
        }
        if (visible.isEmpty()) item { EmptyState(if (search.isEmpty()) "Tu registro empieza aquí" else "Sin resultados", if (search.isEmpty()) "Añade tu primer ingreso o gasto para ver cómo va tu mes." else "Prueba con otro nombre o categoría.", Icons.Default.Search) }
        items(visible, key = { it.id }) { transaction -> Box(Modifier.animateItem(fadeInSpec = if (reducedMotion) null else tween(250), fadeOutSpec = if (reducedMotion) null else tween(150), placementSpec = if (reducedMotion) null else tween(250, easing = SmoothOut))) { TransactionRow(transaction, { onEdit(transaction) }, { onDelete(transaction) }) } }
    }
}

@Composable
private fun TransactionRow(transaction: Transaction, onEdit: (() -> Unit)? = null, onDelete: (() -> Unit)? = null) {
    Surface(Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(transaction.title, Modifier.weight(1f), fontWeight = FontWeight.SemiBold)
                Text("${if (transaction.type == "income") "+" else "−"}${currency(transaction.amount)}", color = if (transaction.type == "income") MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("${transaction.category} · ${readableDate(transaction.date)}", Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                if (onEdit != null && onDelete != null) RecordMenu(transaction.title, onEdit, onDelete)
            }
        }
    }
}

@Composable
private fun GoalDialog(goal: AnnualGoal, onDismiss: () -> Unit, onSave: (String) -> Boolean) {
    var title by rememberSaveable(goal.id) { mutableStateOf(goal.title) }
    var error by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Editar objetivo") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(title, { title = it; error = false }, Modifier.fillMaxWidth(), label = { Text("Objetivo") }, shape = RoundedCornerShape(16.dp), maxLines = 3)
            if (error) Text("No se guardó el cambio. Inténtalo de nuevo.", color = MaterialTheme.colorScheme.error)
        } },
        confirmButton = { GlassButton("Guardar", { error = !onSave(title) }, enabled = title.isNotBlank(), icon = Icons.Default.Check) },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable
private fun ConfirmDelete(title: String, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Eliminar registro") }, text = { Text("¿Eliminar «$title»?") },
        confirmButton = { TextButton(onClick = onConfirm) { Text("Eliminar") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } })
}

@Composable
private fun TransactionDialog(initial: Transaction?, today: String, onDismiss: () -> Unit, onSave: (Transaction) -> Boolean) {
    var title by rememberSaveable { mutableStateOf(initial?.title.orEmpty()) }
    var type by rememberSaveable { mutableStateOf(initial?.type ?: "expense") }
    var amount by rememberSaveable { mutableStateOf(initial?.amount?.toString().orEmpty()) }
    var category by rememberSaveable { mutableStateOf(initial?.category.orEmpty()) }
    var date by rememberSaveable { mutableStateOf(initial?.date ?: today) }
    var note by rememberSaveable { mutableStateOf(initial?.note.orEmpty()) }
    var pickingDate by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val focus = LocalFocusManager.current
    fun save() {
        try {
            val parsed = validateTransaction(title, type, amount, category, date)
            if (onSave(Transaction(initial?.id ?: Uuid.random().toString(), title.trim(), type, parsed, category.trim(), date, note.trim().ifBlank { null }))) focus.clearFocus()
            else error = "No se guardó el cambio. Inténtalo de nuevo."
        } catch (exception: IllegalArgumentException) { error = exception.message }
    }
    val form: @Composable () -> Unit = {
        Column(Modifier.fillMaxWidth().heightIn(max = 700.dp).imePadding().padding(horizontal = 24.dp)) {
            Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(if (initial == null) "Nuevo movimiento" else "Editar movimiento", Modifier.weight(1f), style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                IconButton(onClick = onDismiss) { Icon(Icons.Default.Close, "Cerrar formulario") }
            }
            Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    FilterChip(type == "expense", { type = "expense"; error = null }, label = { Text("Gasto") }, leadingIcon = { Icon(Icons.Default.ArrowUpward, null, Modifier.size(18.dp)) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                    FilterChip(type == "income", { type = "income"; error = null }, label = { Text("Ingreso") }, leadingIcon = { Icon(Icons.Default.ArrowDownward, null, Modifier.size(18.dp)) }, modifier = Modifier.weight(1f).heightIn(min = 48.dp))
                }
                OutlinedTextField(title, { title = it; error = null }, Modifier.fillMaxWidth(), label = { Text("Nombre") }, placeholder = { Text("Por ejemplo, supermercado") }, shape = RoundedCornerShape(16.dp), singleLine = true,
                    isError = error != null && title.isBlank(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                OutlinedTextField(amount, { amount = it; error = null }, Modifier.fillMaxWidth(), label = { Text("Importe") }, prefix = { Text("$ ") }, suffix = { Text("USD") }, placeholder = { Text("0,00") }, shape = RoundedCornerShape(16.dp),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next), singleLine = true)
                OutlinedTextField(category, { category = it; error = null }, Modifier.fillMaxWidth(), label = { Text("Categoría") }, placeholder = { Text("Comida, transporte…") }, shape = RoundedCornerShape(16.dp), singleLine = true,
                    isError = error != null && category.isBlank(), keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next))
                OutlinedButton(onClick = { focus.clearFocus(); pickingDate = true }, modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(16.dp), contentPadding = PaddingValues(16.dp)) {
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text("Fecha", color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodySmall)
                        Text(readableDate(date), color = MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyLarge)
                    }
                    Icon(Icons.Default.CalendarMonth, "Elegir fecha")
                }
                OutlinedTextField(note, { note = it }, Modifier.fillMaxWidth(), label = { Text("Nota (opcional)") }, shape = RoundedCornerShape(16.dp), maxLines = 3,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { save() }))
                Spacer(Modifier.height(4.dp))
            }
            Column(Modifier.padding(top = 12.dp, bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                GlassButton("Guardar movimiento", ::save, Modifier.fillMaxWidth(), Icons.Default.Check)
            }
        }
    }
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (maxWidth < 720.dp) {
            ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true), containerColor = MaterialTheme.colorScheme.surface) { form() }
        } else {
            Dialog(onDismissRequest = onDismiss) { Surface(Modifier.widthIn(max = 480.dp).padding(vertical = 24.dp), shape = RoundedCornerShape(24.dp)) { Column(Modifier.padding(top = 16.dp)) { form() } } }
        }
    }
    if (pickingDate) {
        val initialMillis = runCatching { Instant.parse("${date}T00:00:00Z").toEpochMilliseconds() }.getOrNull()
        val picker = rememberDatePickerState(initialSelectedDateMillis = initialMillis)
        DatePickerDialog(onDismissRequest = { pickingDate = false }, confirmButton = {
            TextButton(onClick = { picker.selectedDateMillis?.let { date = dateFromPicker(it).toString(); error = null }; pickingDate = false }, enabled = picker.selectedDateMillis != null) { Text("Elegir fecha") }
        }, dismissButton = { TextButton(onClick = { pickingDate = false }) { Text("Cancelar") } }) { DatePicker(picker, dateFormatter = SpanishDateFormatter, showModeToggle = false) }
    }
}
