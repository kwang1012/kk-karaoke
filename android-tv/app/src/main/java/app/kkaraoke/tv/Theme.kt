package app.kkaraoke.tv

import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// The look, after the best TV apps: artwork fills the screen, type is large and heavy, corners are small, buttons are
// white or translucent, and the brand pink is only a small accent. Everything is read from the sofa, so there is little
// of it. The TV renders 960 x 540 dp.

val Accent = Color(0xFFFF4F8B)
val AccentBright = Color(0xFFFF6B9D)
val Bg = Color(0xFF121212)
val Panel = Color(0xFF242424)
val PanelFocused = Color(0xFF383838)
val Outline = Color(0x26FFFFFF)

/** The outline of whatever has focus: bright and neutral, so it reads on any cover. */
val Ring = Color(0xFFF2F2F7)
val TextPrimary = Color(0xFFFFFFFF)
val TextDim = Color(0xFFB3B3B3)
val TextFaint = Color(0xFF7A7A7A)

/** Keeps content clear of the edges, where some TVs cut the picture off. */
val ScreenInset = 48.dp

/** The nav bar floats over the content; screens other than Home start below it. */
val TopBarHeight = 92.dp

/** Small corners: tiles and covers are squarish, only buttons are round. */
val CardRadius = 8.dp

object Type {
    val display = TextStyle(fontSize = 44.sp, fontWeight = FontWeight.Bold, lineHeight = 50.sp, letterSpacing = (-0.5).sp)
    val title = TextStyle(fontSize = 30.sp, fontWeight = FontWeight.Bold, lineHeight = 36.sp)
    val heading = TextStyle(fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
    val body = TextStyle(fontSize = 18.sp, lineHeight = 26.sp)
    val bodyStrong = TextStyle(fontSize = 18.sp, fontWeight = FontWeight.Medium)
    val label = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium)
    val caption = TextStyle(fontSize = 13.sp)
    val overline = TextStyle(fontSize = 13.sp, fontWeight = FontWeight.Bold, letterSpacing = 2.sp)
}

@Composable
fun KTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Accent, background = Bg, surface = Panel, onBackground = TextPrimary, onSurface = TextPrimary,
        ),
    ) {
        // Text outside a Surface would otherwise take the default (dark) content colour.
        CompositionLocalProvider(LocalContentColor provides TextPrimary, content = content)
    }
}
