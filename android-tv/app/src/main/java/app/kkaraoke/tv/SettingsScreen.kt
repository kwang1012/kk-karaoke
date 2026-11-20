package app.kkaraoke.tv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val avatarNames = listOf(
    "balloon", "bear", "bunny", "camera", "cat", "compass", "dumpling", "egg", "ghost", "lemon", "owl", "panda",
    "plane", "potato", "shiba", "suitcase", "toast", "train",
)

/** What a person can set on this TV: how it speaks, who it says is singing, and what to do with music videos. */
@Composable
fun SettingsScreen(room: RoomController, onSignIn: () -> Unit, onSignOut: () -> Unit, entry: FocusRequester) {
    var editingName by remember { mutableStateOf(false) }
    val shownName = Prefs.name.ifBlank { Auth.nickname ?: "TV" }
    val shownAvatar = Prefs.avatar.ifBlank { Auth.avatar ?: "/avatars/shiba.svg" }

    LazyColumn(Modifier.fillMaxSize(), contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 12.dp, bottom = 56.dp)) {
        item {
            SectionTitle(tr("Name"))
            Row(Modifier.padding(horizontal = ScreenInset, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Avatar(shownName.firstOrNull()?.uppercase() ?: "K", shownAvatar, diameter = 56.dp)
                TvButton(shownName, { editingName = true }, icon = Glyph.Pencil, focusRequester = entry)
            }
        }
        item {
            SectionTitle(tr("Picture"))
            LazyRow(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = ScreenInset - 8.dp, vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                items(avatarNames.size) { i ->
                    val path = "/avatars/${avatarNames[i]}.svg"
                    Focusable({ Prefs.chooseAvatar(path) }, Modifier.size(64.dp), CircleShape, scaleOnFocus = 1.12f) {
                        Box(contentAlignment = Alignment.Center) {
                            Avatar("", path, diameter = 64.dp)
                            if (path == shownAvatar) Box(Modifier.size(64.dp).background(Color(0x66000000)), contentAlignment = Alignment.Center) { Icon(Glyph.Check, Color.White, 28.dp) }
                        }
                    }
                }
            }
        }
        item {
            SectionTitle(tr("Language"))
            Row(Modifier.padding(horizontal = ScreenInset, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                TvButton("English", { Prefs.chooseLanguage("en") }, primary = Prefs.language == "en", icon = Glyph.Globe)
                TvButton("繁體中文", { Prefs.chooseLanguage("zh-TW") }, primary = Prefs.language == "zh-TW", icon = Glyph.Globe)
            }
        }
        item {
            SectionTitle(tr("Music videos"))
            Row(Modifier.padding(horizontal = ScreenInset, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                listOf("ask" to "Ask each time", "studio" to "Use studio recording", "keep" to "Keep the video").forEach { (mode, label) ->
                    TvButton(tr(label), { Prefs.chooseVersionMode(mode) }, primary = Prefs.versionMode == mode)
                }
            }
        }
        item {
            SectionTitle(tr("Account"))
            Row(Modifier.padding(horizontal = ScreenInset, vertical = 14.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (Auth.signedIn) {
                    Text(Auth.email ?: tr("Signed in"), style = Type.body, color = TextDim, modifier = Modifier.padding(end = 8.dp))
                    TvButton(tr("Sign out of this TV"), onSignOut, icon = Glyph.LogOut)
                } else {
                    TvButton(tr("Sign in"), onSignIn, primary = true, icon = Glyph.LogIn)
                }
            }
        }
        item {
            SectionTitle(tr("Join with your phone"))
            Row(Modifier.padding(horizontal = ScreenInset, vertical = 16.dp), horizontalArrangement = Arrangement.spacedBy(24.dp), verticalAlignment = Alignment.CenterVertically) {
                QrCode(room.joinUrl, Modifier.size(150.dp))
                room.code?.let { Text(it, style = Type.display.copy(fontSize = 44.sp, letterSpacing = 6.sp)) }
            }
        }
    }

    if (editingName) NameDialog(shownName, onDone = { Prefs.chooseName(it.trim()); editingName = false }, onDismiss = { editingName = false })
}

@Composable
private fun NameDialog(current: String, onDone: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(current) }
    val field = remember { FocusRequester() }
    androidx.compose.runtime.LaunchedEffect(Unit) { runCatching { field.requestFocus() } }
    androidx.compose.ui.window.Dialog(onDismissRequest = onDismiss) {
        Column(Modifier.clip(RoundedCornerShape(16.dp)).background(Color(0xFF1E1C26)).padding(28.dp).width(520.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Text(tr("Name"), style = Type.heading)
            BasicTextField(
                text, { text = it.take(24) },
                Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Panel).padding(16.dp).focusRequester(field),
                singleLine = true, textStyle = TextStyle(color = TextPrimary, fontSize = 24.sp), cursorBrush = SolidColor(Accent),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = androidx.compose.ui.text.input.ImeAction.Done),
                keyboardActions = androidx.compose.foundation.text.KeyboardActions(onDone = { onDone(text) }),
            )
            TvButton("OK", { onDone(text) }, primary = true)
        }
    }
}
