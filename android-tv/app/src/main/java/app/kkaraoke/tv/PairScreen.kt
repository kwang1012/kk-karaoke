package app.kkaraoke.tv

import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

private sealed interface PairState {
    data object Starting : PairState
    data class Waiting(val start: PairingStart) : PairState
    data object Expired : PairState
    data class Failed(val message: String) : PairState
}

/** The code is shown as people read it: ABCD-EFGH. */
private fun spaced(code: String) = if (code.length > 4) code.take(4) + "-" + code.drop(4) else code

/**
 * Signing in by pairing: the TV shows a code and a QR code, a signed-in person approves it on their phone, and the TV
 * collects its own token. Nothing is typed on the TV.
 */
@Composable
fun PairScreen(room: RoomController, onClose: () -> Unit) {
    var attempt by remember { mutableIntStateOf(0) }
    var state by remember { mutableStateOf<PairState>(PairState.Starting) }
    val cancel = remember { FocusRequester() }

    LaunchedEffect(attempt) {
        state = PairState.Starting
        try {
            val start = Api.startPairing(room.name)
            val endsAt = SystemClock.elapsedRealtime() + start.expiresIn * 1000L
            state = PairState.Waiting(start)
            while (SystemClock.elapsedRealtime() < endsAt) {
                delay(start.interval.coerceAtLeast(1) * 1000L)
                val poll = try {
                    Api.pollPairing(start.deviceCode)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: ApiException) {
                    if (e.code == 410) break else continue
                } catch (e: Exception) {
                    continue // a blip in the network: ask again
                }
                if (poll.status == "approved" && poll.accessToken != null) {
                    Auth.save(poll)
                    room.signedIn()
                    onClose()
                    return@LaunchedEffect
                }
            }
            state = PairState.Expired
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiException) {
            state = PairState.Failed(
                if (e.code == 404) "This server doesn't offer sign-in from a TV yet." else e.message ?: "Couldn't start sign-in.",
            )
        } catch (e: Exception) {
            state = PairState.Failed("Couldn't reach the server.")
        }
    }
    LaunchedEffect(state) { runCatching { cancel.requestFocus() } }
    BackHandler(onBack = onClose)

    Row(
        Modifier.fillMaxSize().padding(horizontal = 72.dp, vertical = 40.dp),
        horizontalArrangement = Arrangement.spacedBy(64.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val waiting = state as? PairState.Waiting
        if (waiting != null) {
            val url = "${Api.WEB}/link?code=${waiting.start.userCode}"
            QrCode(url, Modifier.size(244.dp))
        }
        Column(Modifier.width(520.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Text("Sign in with your phone", style = Type.display.copy(fontSize = 40.sp))
            when (val s = state) {
                PairState.Starting -> Text("Getting a code…", style = Type.body.copy(fontSize = 20.sp), color = TextDim)
                is PairState.Waiting -> {
                    Step(1, "Scan the QR code, or open ${Api.WEB.removePrefix("https://")}/link on your phone.")
                    Step(2, "Sign in if asked, and check that this code matches.")
                    Box(Modifier.clip(RoundedCornerShape(CardRadius)).background(Panel).padding(horizontal = 24.dp, vertical = 12.dp)) {
                        Text(spaced(s.start.userCode), fontSize = 44.sp, fontWeight = FontWeight.Bold, letterSpacing = 6.sp)
                    }
                    Step(3, "Choose “Yes, sign in the TV”. This screen continues by itself.")
                }
                PairState.Expired -> Text("The code ran out. Get a new one to try again.", style = Type.body.copy(fontSize = 20.sp), color = Accent)
                is PairState.Failed -> Text(s.message, style = Type.body.copy(fontSize = 20.sp), color = Accent)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(top = 6.dp)) {
                TvButton("Cancel", onClose, focusRequester = cancel)
                if (state is PairState.Expired || state is PairState.Failed) TvButton("New code", { attempt += 1 }, primary = true)
            }
        }
    }
}

@Composable
private fun Step(number: Int, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Box(Modifier.size(30.dp).border(2.dp, TextDim, CircleShape), contentAlignment = Alignment.Center) {
            Text(number.toString(), style = Type.label, color = TextDim)
        }
        Text(text, style = Type.body.copy(fontSize = 19.sp), modifier = Modifier.weight(1f))
    }
}
