package com.miser.shared

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.datetime.TimeZone
import kotlinx.datetime.toLocalDateTime
import kotlin.time.Instant

// The same motion scale as the web client, implemented with Compose animations.
internal val LocalReducedMotion = staticCompositionLocalOf { false }
internal val SmoothOut = CubicBezierEasing(.22f, 1f, .36f, 1f)
@Composable internal fun motionDuration(milliseconds: Int) = if (LocalReducedMotion.current) 0 else milliseconds

@Composable
private fun glassFill(onColor: Boolean = false): Brush {
    val colors = MaterialTheme.colorScheme
    return Brush.linearGradient(listOf(
        if (onColor) Color.White.copy(alpha = .26f) else colors.primaryContainer.copy(alpha = .9f),
        if (onColor) Color.White.copy(alpha = .10f) else colors.surface.copy(alpha = .72f),
    ))
}

@Composable
private fun glassEdge(onColor: Boolean = false) = BorderStroke(1.dp, Brush.linearGradient(listOf(
    if (onColor) Color.White.copy(alpha = .6f) else MaterialTheme.colorScheme.primary.copy(alpha = .30f),
    if (onColor) Color.White.copy(alpha = .12f) else MaterialTheme.colorScheme.primary.copy(alpha = .08f),
)))

@Composable
internal fun GlassButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    icon: ImageVector? = null, enabled: Boolean = true, onColor: Boolean = false,
) {
    val interactions = remember { MutableInteractionSource() }
    val pressed by interactions.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) .97f else 1f, tween(motionDuration(150), easing = SmoothOut))
    val shape = RoundedCornerShape(16.dp)
    val foreground = if (onColor) Color.White else MaterialTheme.colorScheme.onPrimaryContainer
    Button(
        onClick = onClick, enabled = enabled, interactionSource = interactions,
        modifier = modifier.heightIn(min = 52.dp).graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(shape).background(glassFill(onColor)).border(glassEdge(onColor), shape),
        shape = shape,
        colors = ButtonDefaults.buttonColors(
            containerColor = Color.Transparent, contentColor = foreground,
            disabledContainerColor = MaterialTheme.colorScheme.surfaceVariant,
            disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
        ),
        contentPadding = PaddingValues(horizontal = 20.dp, vertical = 14.dp),
    ) {
        icon?.let { Icon(it, null, Modifier.size(20.dp)); Spacer(Modifier.width(8.dp)) }
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
internal fun GlassIconButton(icon: ImageVector, label: String, onClick: () -> Unit, onColor: Boolean = false) {
    val shape = RoundedCornerShape(16.dp)
    IconButton(
        onClick = onClick,
        modifier = Modifier.size(48.dp).background(glassFill(onColor), shape).border(glassEdge(onColor), shape),
    ) {
        Icon(icon, label, Modifier.size(22.dp), tint = if (onColor) Color.White else MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
internal fun GlassNavigation(selected: Screen, onSelect: (Screen) -> Unit) {
    val colors = MaterialTheme.colorScheme
    val shape = RoundedCornerShape(24.dp)
    Box(Modifier.navigationBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp), contentAlignment = Alignment.Center) {
        BoxWithConstraints(
            Modifier.widthIn(max = 460.dp).fillMaxWidth().clip(shape)
                .background(Brush.linearGradient(listOf(colors.surface.copy(alpha = .98f), colors.primaryContainer.copy(alpha = .94f))))
                .border(glassEdge(), shape).padding(6.dp),
        ) {
            val itemWidth = maxWidth / Screen.entries.size
            val offset by animateDpAsState(itemWidth * selected.ordinal, tween(motionDuration(250), easing = SmoothOut))
            Box(Modifier.offset(x = offset).width(itemWidth).height(68.dp).clip(RoundedCornerShape(20.dp)).background(glassFill()).border(glassEdge(), RoundedCornerShape(20.dp)))
            NavigationBar(
                containerColor = Color.Transparent, tonalElevation = 0.dp,
                windowInsets = WindowInsets(0, 0, 0, 0), modifier = Modifier.height(68.dp),
            ) {
                Screen.entries.forEach { screen ->
                    NavigationBarItem(
                        selected = selected == screen, onClick = { onSelect(screen) },
                        icon = { Icon(screen.icon, null, Modifier.size(22.dp)) },
                        label = { Text(screen.label, style = MaterialTheme.typography.labelMedium, fontWeight = if (selected == screen) FontWeight.Bold else FontWeight.Medium) },
                        colors = NavigationBarItemDefaults.colors(
                            indicatorColor = Color.Transparent,
                            selectedIconColor = colors.onPrimaryContainer, selectedTextColor = colors.onPrimaryContainer,
                            unselectedIconColor = colors.onSurfaceVariant, unselectedTextColor = colors.onSurfaceVariant,
                        ),
                    )
                }
            }
        }
    }
}

@Composable
internal fun RecordMenu(title: String, onEdit: () -> Unit, onDelete: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        IconButton(onClick = { open = true }) { Icon(Icons.Default.MoreHoriz, "Opciones de $title") }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            DropdownMenuItem(text = { Text("Editar") }, leadingIcon = { Icon(Icons.Default.Edit, null) }, onClick = { open = false; onEdit() })
            DropdownMenuItem(text = { Text("Eliminar", color = MaterialTheme.colorScheme.error) }, leadingIcon = { Icon(Icons.Default.DeleteOutline, null, tint = MaterialTheme.colorScheme.error) }, onClick = { open = false; onDelete() })
        }
    }
}

@Composable
internal fun EmptyState(title: String, message: String, icon: ImageVector) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Icon(icon, null, Modifier.size(32.dp), tint = MaterialTheme.colorScheme.primary)
        Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
        Text(message, color = MaterialTheme.colorScheme.onSurfaceVariant, style = MaterialTheme.typography.bodyMedium)
    }
}

internal fun readableDate(date: String): String = if (date.length == 10 && date[4] == '-' && date[7] == '-') "${date.takeLast(2)}/${date.substring(5, 7)}/${date.take(4)}" else date

internal val monthNames = listOf("enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre")
internal fun dateFromPicker(milliseconds: Long) = Instant.fromEpochMilliseconds(milliseconds).toLocalDateTime(TimeZone.UTC).date

// DatePicker uses midnight UTC. Its web formatter otherwise shifts dates in UTC−5.
@OptIn(ExperimentalMaterial3Api::class)
internal object SpanishDateFormatter : DatePickerFormatter {
    override fun formatMonthYear(monthMillis: Long?, locale: CalendarLocale): String? = monthMillis?.let {
        val date = dateFromPicker(it)
        "${monthNames[date.month.ordinal]} de ${date.year}"
    }
    override fun formatDate(dateMillis: Long?, locale: CalendarLocale, forContentDescription: Boolean): String? = dateMillis?.let {
        val date = dateFromPicker(it)
        if (forContentDescription) "${date.day} de ${monthNames[date.month.ordinal]} de ${date.year}" else readableDate(date.toString())
    }
}
