package app.kkaraoke.tv

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.produceState
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import coil.imageLoader
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.size.Size as CoilSize

// MARK: Focus

/**
 * Anything the D-pad can land on. Focus is shown the way TV apps do: it grows a little and gets a bright outline; things
 * with a solid face (covers) also get a soft glow. Select clicks it.
 */
@Composable
fun Focusable(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    shape: Shape = RoundedCornerShape(CardRadius),
    focusRequester: FocusRequester? = null,
    scaleOnFocus: Float = 1.04f,
    glow: Boolean = false,
    onFocusChange: ((Boolean) -> Unit)? = null,
    /** Where Down goes from here, when the automatic choice can't be trusted (the floating nav bar above a screen). */
    down: FocusRequester? = null,
    content: @Composable BoxScope.(focused: Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        if (focused) scaleOnFocus else 1f,
        spring(stiffness = Spring.StiffnessMediumLow), label = "focusScale",
    )
    Box(
        modifier
            .then(if (down != null) Modifier.focusProperties { this.down = down } else Modifier)
            .then(if (focusRequester != null) Modifier.focusRequester(focusRequester) else Modifier)
            .onFocusChanged { focused = it.isFocused; onFocusChange?.invoke(it.isFocused) }
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .then(if (glow && focused) Modifier.shadow(20.dp, shape, ambientColor = Color.Black, spotColor = Accent) else Modifier)
            .clip(shape)
            .border(if (focused) 2.dp else 0.dp, if (focused) Ring else Color.Transparent, shape)
            .clickable(onClick = onClick),
    ) { content(focused) }
}

// MARK: Icons

/** The icons the app uses, all from the Lucide set the web and Mac apps use, so they look like one family. */
enum class Glyph(val lucide: String, val solid: Boolean = false) {
    Play("play", true), Pause("pause", true), Next("skip-forward", true), Previous("skip-back", true),
    Rewind("rewind", true), Forward("fast-forward", true),
    Plus("plus"), Minus("minus"), Check("check"), Search("search"), Bars("audio-lines"),
    Home("house"), Library("library-big"), Queue("list-music"),
    Mic("mic-vocal"), MicOff("mic-off"), Speaker("volume-2"), VolumeMid("volume-1"), VolumeLow("volume"), Mute("volume-x"), Timer("timer"),
    Settings("settings"), Globe("globe"), User("user"), Users("users"), Trophy("trophy"), History("history"), Close("x"),
    Up("chevron-up"), Down("chevron-down"), Video("video"), Studio("disc-3"), Pencil("pencil"), Trash("trash-2"),
    Shuffle("shuffle"), Crown("crown"), LogIn("log-in"), LogOut("log-out"), Music("music"), Back("arrow-left"),
}

private val parsedIcons = HashMap<String, List<Path>>()

private fun iconPaths(name: String): List<Path> = parsedIcons.getOrPut(name) {
    LucideData.paths[name].orEmpty().map { PathParser().parsePathString(it).toPath() }
}

@Composable
fun Icon(glyph: Glyph, tint: Color, size: Dp = 24.dp, modifier: Modifier = Modifier) {
    val paths = remember(glyph) { iconPaths(glyph.lucide) }
    Canvas(modifier.size(size)) {
        val scale = this.size.width / 24f
        withTransform({ scale(scale, scale, pivot = Offset.Zero) }) {
            for (path in paths) {
                // transport icons are solid, as on a player; the rest are Lucide's 2 unit round stroke
                if (glyph.solid) drawPath(path, tint, style = Fill)
                drawPath(path, tint, style = Stroke(width = 2f, cap = StrokeCap.Round, join = StrokeJoin.Round))
            }
        }
    }
}

/** Three bars that dance while a song plays and rest when it does not. */
@Composable
fun Equalizer(playing: Boolean, tint: Color, modifier: Modifier = Modifier, size: Dp = 18.dp) {
    if (playing) {
        val transition = androidx.compose.animation.core.rememberInfiniteTransition(label = "equalizer")
        @Composable fun bar(millis: Int) = transition.animateFloat(
            0.25f, 1f,
            androidx.compose.animation.core.infiniteRepeatable(
                androidx.compose.animation.core.tween(millis, easing = androidx.compose.animation.core.LinearEasing),
                androidx.compose.animation.core.RepeatMode.Reverse,
            ),
            label = "bar",
        )
        val a by bar(520)
        val b by bar(380)
        val c by bar(650)
        EqualizerBars(a, b, c, tint, modifier, size)
    } else {
        EqualizerBars(0.3f, 0.3f, 0.3f, tint, modifier, size)
    }
}

@Composable
private fun EqualizerBars(a: Float, b: Float, c: Float, tint: Color, modifier: Modifier, size: Dp) {
    Canvas(modifier.size(size)) {
        val w = this.size.width
        val h = this.size.height
        val bar = w * 0.22f
        listOf(a to 0.08f, b to 0.39f, c to 0.7f).forEach { (height, x) ->
            val barHeight = h * height
            drawRoundRect(tint, Offset(w * x, h - barHeight), Size(bar, barHeight), CornerRadius(bar / 2))
        }
    }
}

// MARK: Buttons

enum class ButtonStyle { Primary, Secondary, Ghost }

@Composable
fun TvButton(
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    primary: Boolean = false,
    focusRequester: FocusRequester? = null,
    icon: Glyph? = null,
    /** Stretch to the width the caller gives it, with the label in the middle. */
    fill: Boolean = false,
    style: ButtonStyle = if (primary) ButtonStyle.Primary else ButtonStyle.Secondary,
    down: FocusRequester? = null,
) {
    Focusable(onClick, modifier, RoundedCornerShape(50), focusRequester, scaleOnFocus = 1.06f, down = down) { focused ->
        val face = when (style) {
            ButtonStyle.Primary -> Color.White
            ButtonStyle.Secondary -> if (focused) Color(0x4DFFFFFF) else Color(0x29FFFFFF)
            ButtonStyle.Ghost -> if (focused) Color(0x26FFFFFF) else Color.Transparent
        }
        val ink = if (style == ButtonStyle.Primary) Bg else TextPrimary
        Row(
            Modifier
                .then(if (fill) Modifier.fillMaxWidth() else Modifier)
                .background(face)
                .padding(horizontal = 26.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = if (fill) Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally) else Arrangement.spacedBy(10.dp),
        ) {
            if (icon != null) Icon(icon, ink, 20.dp)
            if (label.isNotEmpty()) {
                Text(label, style = Type.label, color = ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * A round button with only an icon: the transport controls. [active] marks a switch that is on. [onUp] and [onDown], when
 * given, are what the Up and Down keys do while this button has focus (volume, timing), instead of moving away.
 */
@Composable
fun IconButton(
    glyph: Glyph,
    description: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    diameter: Dp = 60.dp,
    primary: Boolean = false,
    active: Boolean = false,
    focusRequester: FocusRequester? = null,
    onFocusChange: ((Boolean) -> Unit)? = null,
    onUp: (() -> Unit)? = null,
    onDown: (() -> Unit)? = null,
) {
    val keys = if (onUp == null && onDown == null) Modifier else Modifier.onPreviewKeyEvent { e ->
        if (e.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
        when (e.key) {
            Key.DirectionUp -> if (onUp != null) { onUp(); true } else false
            Key.DirectionDown -> if (onDown != null) { onDown(); true } else false
            else -> false
        }
    }
    var hasFocus by remember { mutableStateOf(false) }
    Box(modifier.size(diameter)) {
        Focusable(
            onClick, Modifier.fillMaxSize().then(keys), CircleShape, focusRequester, scaleOnFocus = 1.1f,
            onFocusChange = { hasFocus = it; onFocusChange?.invoke(it) },
        ) { focused ->
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        when {
                            primary -> if (focused) Color.White else Color(0xFFF0F0F5)
                            active -> if (focused) Color(0x66FFFFFF) else Color(0x47FFFFFF)
                            else -> if (focused) Color(0x40FFFFFF) else Color(0x1FFFFFFF)
                        },
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(glyph, if (primary) Bg else TextPrimary, diameter * 0.42f)
            }
        }
        // An icon that Up and Down adjust says so with two small arrows inside it while it has focus.
        if ((onUp != null || onDown != null) && hasFocus) {
            Icon(Glyph.Up, Color(0xB3FFFFFF), 12.dp, modifier = Modifier.align(Alignment.TopCenter).padding(top = 3.dp))
            Icon(Glyph.Down, Color(0xB3FFFFFF), 12.dp, modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp))
        }
    }
}

// MARK: The stage colour

private val FallbackStage = Color(0xFF3A3A3A)

/**
 * The colour the karaoke stage is painted: the cover's most common colour, kept dark enough for white lyrics to read. It
 * is a flat colour, not the picture, as in the Mac app's TV display.
 */
@Composable
fun rememberStageColor(url: String?): State<Color> {
    val context = LocalContext.current
    val target = produceState(FallbackStage, url) {
        value = if (url == null) FallbackStage else (dominantColor(context, url) ?: FallbackStage)
    }
    return animateColorAsState(target.value, tween(600), label = "stageColor")
}

private suspend fun dominantColor(context: android.content.Context, url: String): Color? {
    val result = try {
        context.imageLoader.execute(ImageRequest.Builder(context).data(url).size(CoilSize(32, 32)).allowHardware(false).build())
    } catch (e: Exception) {
        return null
    }
    val bitmap = (result.drawable as? android.graphics.drawable.BitmapDrawable)?.bitmap ?: return null
    return withContext(Dispatchers.Default) {
        val pixels = IntArray(bitmap.width * bitmap.height)
        bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
        // the most populous colour bucket, not an average that turns colourful covers grey
        val buckets = HashMap<Int, FloatArray>()
        for (p in pixels) {
            val r = (p shr 16) and 0xFF
            val g = (p shr 8) and 0xFF
            val b = p and 0xFF
            val sums = buckets.getOrPut((r / 32 shl 6) or (g / 32 shl 3) or (b / 32)) { FloatArray(4) }
            sums[0] += 1f; sums[1] += r; sums[2] += g; sums[3] += b
        }
        val top = buckets.values.maxByOrNull { it[0] } ?: return@withContext null
        val r = top[1] / top[0] / 255f
        val g = top[2] / top[0] / 255f
        val b = top[3] / top[0] / 255f
        val high = maxOf(r, g, b)
        val low = minOf(r, g, b)
        val l = (high + low) / 2
        val d = high - low
        val s = if (d == 0f) 0f else d / (1 - kotlin.math.abs(2 * l - 1))
        val h = when {
            d == 0f -> 0f
            high == r -> 60f * (((g - b) / d) % 6)
            high == g -> 60f * ((b - r) / d + 2)
            else -> 60f * ((r - g) / d + 4)
        }
        Color.hsl((h + 360f) % 360f, s.coerceIn(0f, 1f), l.coerceIn(0.16f, 0.32f))
    }
}

// MARK: Pictures

/** A cover, fetched at the size it is shown so a shelf of them stays light on a TV with little memory. */
@Composable
fun Cover(url: String?, modifier: Modifier = Modifier, shape: Shape = RoundedCornerShape(CardRadius), px: Int = 400) {
    val context = LocalContext.current
    Box(modifier.clip(shape).background(Panel)) {
        if (url != null) {
            AsyncImage(
                ImageRequest.Builder(context).data(url).size(CoilSize(px, px)).build(), null,
                Modifier.fillMaxSize(), contentScale = ContentScale.Crop,
            )
        }
    }
}

/**
 * The cover, enlarged from a tiny copy so it is a soft wash of its colours, under a gradient into the background: the
 * stage a screen is set on. A blur would look the same and cost a TV's graphics chip far more.
 */
@Composable
fun Backdrop(url: String?, modifier: Modifier = Modifier, strength: Float = 0.7f, sideFade: Boolean = false, px: Int = 32) {
    val context = LocalContext.current
    Box(modifier) {
        if (url != null) {
            AsyncImage(
                ImageRequest.Builder(context).data(url).size(CoilSize(px, px)).build(), null,
                Modifier.fillMaxSize().graphicsLayer { alpha = strength }, contentScale = ContentScale.Crop,
            )
        }
        Box(Modifier.fillMaxSize().background(Brush.verticalGradient(0f to Color(0x59000000), 1f to Bg)))
        if (sideFade) Box(Modifier.fillMaxSize().background(Brush.horizontalGradient(0f to Color(0xD9121212), 0.75f to Color.Transparent)))
    }
}

// MARK: Cards and rows

/** A cover with its title under it. Only the cover is outlined; the words brighten while it is focused. */
@Composable
fun PosterCard(
    title: String,
    subtitle: String,
    artwork: String?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    width: Dp = 168.dp,
    focusRequester: FocusRequester? = null,
) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.width(width)) {
        Focusable(
            onClick, Modifier.fillMaxWidth().aspectRatio(1f), RoundedCornerShape(CardRadius), focusRequester,
            glow = true, onFocusChange = { focused = it },
        ) { Cover(artwork, Modifier.fillMaxSize(), RoundedCornerShape(0.dp)) }
        Spacer(Modifier.height(10.dp))
        Text(
            title, style = Type.label, color = if (focused) TextPrimary else Color(0xFFD6D6E2),
            maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        if (subtitle.isNotEmpty()) {
            Text(subtitle, style = Type.caption, color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** A flat tile: the cover at the left, a bold name beside it. Spotify's "jump back in" shortcuts. */
@Composable
fun TileCard(title: String, artwork: String?, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Focusable(onClick, modifier, RoundedCornerShape(6.dp), scaleOnFocus = 1.03f) { focused ->
        Row(
            Modifier.fillMaxWidth().background(if (focused) PanelFocused else Color(0xCC2A2A2A)),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Cover(artwork, Modifier.size(64.dp), RoundedCornerShape(0.dp), px = 160)
            Text(
                title, Modifier.padding(horizontal = 16.dp).weight(1f), style = Type.label.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
                maxLines = 2, overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** A song in a list. Flat until focused, so a long list stays calm. */
@Composable
fun TrackRow(
    track: Track,
    ready: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    number: Int? = null,
    focusRequester: FocusRequester? = null,
) {
    Focusable(onClick, modifier.fillMaxWidth(), RoundedCornerShape(CardRadius), focusRequester, scaleOnFocus = 1.015f) { focused ->
        Row(
            Modifier
                .fillMaxWidth()
                .background(if (focused) PanelFocused else Color.Transparent)
                .padding(horizontal = 14.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (number != null) Text(number.toString(), style = Type.label, color = TextFaint, modifier = Modifier.width(32.dp))
            Cover(track.artworkUrl, Modifier.size(54.dp), RoundedCornerShape(4.dp), px = 160)
            Column(Modifier.weight(1f)) {
                Text(track.name, style = Type.bodyStrong, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(track.artistText, style = Type.caption.copy(fontSize = 15.sp), color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (track.kind == "video") KindBadge("Video")
            if (ready) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Glyph.Check, Accent, 16.dp)
                    Text("Ready", style = Type.caption, color = Accent)
                }
            }
            track.durationMs?.let { Text(formatTime(it), style = Type.label, color = TextDim, modifier = Modifier.width(52.dp)) }
        }
    }
}

// MARK: Layout helpers

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    Row(modifier.padding(horizontal = ScreenInset), verticalAlignment = Alignment.Bottom) {
        Text(text, style = Type.heading)
        if (trailing != null) Text("  $trailing", style = Type.label, color = TextFaint, modifier = Modifier.padding(bottom = 2.dp))
    }
}

/** A horizontal shelf: its title, then items that scroll sideways. */
@Composable
fun <T> Shelf(title: String, entries: List<T>, key: ((T) -> Any)? = null, content: @Composable (T) -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        SectionTitle(title)
        LazyRow(
            contentPadding = PaddingValues(horizontal = ScreenInset, vertical = 18.dp),
            horizontalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            items(entries.size, key = key?.let { k -> { i: Int -> k(entries[i]) } }) { content(entries[it]) }
        }
    }
}

/** What a screen says when there is nothing to show. */
@Composable
fun EmptyState(title: String, body: String, modifier: Modifier = Modifier, action: (@Composable () -> Unit)? = null) {
    Column(
        modifier.fillMaxWidth().padding(horizontal = ScreenInset, vertical = 56.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box(Modifier.size(72.dp).clip(CircleShape).background(Panel), contentAlignment = Alignment.Center) {
            Icon(Glyph.Bars, TextFaint, 30.dp)
        }
        Spacer(Modifier.height(6.dp))
        Text(title, style = Type.heading)
        Text(body, style = Type.body, color = TextDim)
        action?.invoke()
    }
}

/** A line of loading or error text on a screen that is still fetching. */
@Composable
fun Message(text: String, modifier: Modifier = Modifier, inset: Dp = ScreenInset, action: (@Composable () -> Unit)? = null) {
    Column(modifier.fillMaxWidth().padding(inset), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Text(text, style = Type.body.copy(fontSize = 20.sp), color = TextDim)
        action?.invoke()
    }
}

// MARK: Sheets

data class SheetAction(val label: String, val icon: Glyph? = null, val run: () -> Unit)

/** A small menu of choices over the screen. The dialog is its own window, so the D-pad stays inside it. */
@Composable
fun ActionSheet(title: String, subtitle: String, actions: List<SheetAction>, onDismiss: () -> Unit, artwork: String? = null) {
    val first = remember { FocusRequester() }
    LaunchedEffect(Unit) { runCatching { first.requestFocus() } }
    androidx.compose.ui.window.Dialog(
        onDismissRequest = onDismiss,
        properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false),
    ) {
        Column(
            Modifier
                .width(460.dp)
                .clip(RoundedCornerShape(16.dp))
                .background(Panel)
                .border(1.dp, Outline, RoundedCornerShape(16.dp))
                .padding(28.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                if (artwork != null) Cover(artwork, Modifier.size(64.dp), RoundedCornerShape(6.dp), px = 200)
                Column(Modifier.weight(1f)) {
                    Text(title, style = Type.heading, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    if (subtitle.isNotEmpty()) Text(subtitle, style = Type.label, color = TextDim, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            Spacer(Modifier.height(4.dp))
            actions.forEachIndexed { i, action ->
                TvButton(
                    action.label, { action.run(); onDismiss() },
                    Modifier.fillMaxWidth(), primary = i == 0, focusRequester = if (i == 0) first else null,
                    icon = action.icon, fill = true,
                )
            }
        }
    }
}

// MARK: Misc

/** A QR code for [text], as an image that can be drawn. */
fun qrMatrix(text: String): com.google.zxing.qrcode.encoder.ByteMatrix =
    com.google.zxing.qrcode.encoder.Encoder.encode(
        text, com.google.zxing.qrcode.decoder.ErrorCorrectionLevel.H,
        mapOf(com.google.zxing.EncodeHintType.MARGIN to 0),
    ).matrix

/**
 * A QR code in the app's look: round dots, rounded corner markers, and the logo in the middle (the code is made with the
 * highest error correction, so covering its centre is safe). Dark on white, so phones read it from across a room.
 */
@Composable
fun QrCode(text: String, modifier: Modifier = Modifier) {
    val matrix = remember(text) { qrMatrix(text) }
    Box(modifier.clip(RoundedCornerShape(14.dp)).background(Color.White), contentAlignment = Alignment.Center) {
    androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
        val n = matrix.width
        val pad = size.width * 0.07f
        val cell = (size.width - pad * 2) / n
        val ink = Color(0xFF16121A)
        fun marker(x: Int, y: Int) {
            val ox = pad + x * cell; val oy = pad + y * cell
            drawRoundRect(ink, androidx.compose.ui.geometry.Offset(ox, oy), androidx.compose.ui.geometry.Size(cell * 7, cell * 7), androidx.compose.ui.geometry.CornerRadius(cell * 2.2f))
            drawRoundRect(Color.White, androidx.compose.ui.geometry.Offset(ox + cell, oy + cell), androidx.compose.ui.geometry.Size(cell * 5, cell * 5), androidx.compose.ui.geometry.CornerRadius(cell * 1.4f))
            drawRoundRect(Accent, androidx.compose.ui.geometry.Offset(ox + cell * 2, oy + cell * 2), androidx.compose.ui.geometry.Size(cell * 3, cell * 3), androidx.compose.ui.geometry.CornerRadius(cell * 1f))
        }
        marker(0, 0); marker(n - 7, 0); marker(0, n - 7)
        val mid = n / 2f
        val hole = n * 0.2f // the logo's square, in cells
        for (y in 0 until n) for (x in 0 until n) {
            if (matrix[x, y].toInt() != 1) continue
            if ((x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)) continue
            if (kotlin.math.abs(x + 0.5f - mid) < hole / 2 + 0.5f && kotlin.math.abs(y + 0.5f - mid) < hole / 2 + 0.5f) continue
            drawCircle(ink, cell * 0.46f, androidx.compose.ui.geometry.Offset(pad + (x + 0.5f) * cell, pad + (y + 0.5f) * cell))
        }
        val logo = (hole + 1f) * cell
        drawRoundRect(Color.White, androidx.compose.ui.geometry.Offset(size.width / 2 - logo / 2, size.height / 2 - logo / 2), androidx.compose.ui.geometry.Size(logo, logo), androidx.compose.ui.geometry.CornerRadius(logo * 0.28f))
    }
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(R.drawable.ic_launcher), null, Modifier.size(maxWidth * 0.2f).clip(RoundedCornerShape(maxWidth * 0.05f)))
    }
    }
}

fun formatTime(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    return "%d:%02d".format(total / 60, total % 60)
}

/**
 * Who the TV is signed in as: the picture they chose on their account (one of the web app's bundled avatars), over their
 * first letter, which shows while the picture loads or if it can't.
 */
@Composable
fun Avatar(letter: String, avatarPath: String? = null, modifier: Modifier = Modifier, diameter: Dp = 44.dp) {
    val context = LocalContext.current
    Box(modifier.size(diameter).clip(CircleShape).background(Accent), contentAlignment = Alignment.Center) {
        Text(letter, fontSize = (diameter.value * 0.46f).sp, fontWeight = FontWeight.Bold, color = Color.White)
        if (avatarPath != null) {
            AsyncImage(
                ImageRequest.Builder(context).data(Api.WEB + avatarPath).size(CoilSize(160, 160)).build(), null,
                Modifier.fillMaxSize().background(Panel), contentScale = ContentScale.Crop,
            )
        }
    }
}

/** A grey block that breathes, standing where something is still loading. */
@Composable
fun Bone(modifier: Modifier, shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(CardRadius)) {
    val pulse = androidx.compose.animation.core.rememberInfiniteTransition(label = "bone")
    val alpha by pulse.animateFloat(
        0.07f, 0.16f,
        androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(900), androidx.compose.animation.core.RepeatMode.Reverse),
        label = "bone",
    )
    Box(modifier.clip(shape).background(Color.White.copy(alpha = alpha)))
}

/** Rows of poster cards standing where a screen's shelves are still arriving. */
@Composable
fun ShelfSkeleton() {
    Column(Modifier.padding(start = ScreenInset, top = 12.dp), verticalArrangement = Arrangement.spacedBy(26.dp)) {
        repeat(2) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Bone(Modifier.width(170.dp).height(20.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(18.dp)) { repeat(7) { Bone(Modifier.size(150.dp)) } }
            }
        }
    }
}

/** A small tag beside a song that is a music video rather than the studio recording. */
@Composable
fun KindBadge(text: String) {
    Row(
        Modifier.clip(RoundedCornerShape(4.dp)).background(Color(0x26FFFFFF)).padding(horizontal = 7.dp, vertical = 3.dp),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Glyph.Video, TextDim, 12.dp)
        Text(text, style = Type.label.copy(fontSize = 12.sp), color = TextDim)
    }
}

/** Song rows standing where a list of songs is still arriving. */
@Composable
fun TrackListSkeleton(rows: Int = 8, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        repeat(rows) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Bone(Modifier.size(54.dp), RoundedCornerShape(4.dp))
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Bone(Modifier.fillMaxWidth(0.45f).height(18.dp))
                    Bone(Modifier.fillMaxWidth(0.28f).height(14.dp))
                }
                Bone(Modifier.width(44.dp).height(14.dp))
            }
        }
    }
}
