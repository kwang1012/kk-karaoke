package app.kkaraoke.tv

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

/**
 * Who this TV is signed in as. The TV never holds the account's own credentials: a person approves a code on their phone
 * and the server gives the TV a token of its own, which it can host rooms and add songs with, but which can be revoked and
 * does not open the admin pages. The token sits in this app's private storage.
 */
object Auth {
    private const val FILE = "kkaraoke-auth"
    private var prefs: android.content.SharedPreferences? = null

    var userId by mutableStateOf<String?>(null); private set
    var email by mutableStateOf<String?>(null); private set

    /** The name and picture saved on the account, as the web app shows them. */
    var nickname by mutableStateOf<String?>(null); private set
    var avatar by mutableStateOf<String?>(null); private set
    val signedIn: Boolean get() = userId != null

    /** Seconds since the epoch at which the token stops working. */
    private var expiresAt = 0L

    fun load(context: Context) {
        val saved = context.getSharedPreferences(FILE, Context.MODE_PRIVATE).also { prefs = it }
        val token = saved.getString("token", null)
        val id = saved.getString("userId", null)
        if (token == null || id == null) return
        expiresAt = saved.getLong("expiresAt", 0L)
        if (expiresAt <= now()) { forget(); return }
        userId = id
        email = saved.getString("email", null)
        nickname = saved.getString("nickname", null)
        avatar = saved.getString("avatar", null)
        Api.token = token
    }

    /** Keeps a token the server just issued. */
    fun save(poll: PairingPoll) {
        val token = poll.accessToken ?: return
        val user = poll.user ?: return
        expiresAt = now() + (poll.expiresIn ?: 0L)
        prefs?.edit()
            ?.putString("token", token)?.putString("userId", user.id)?.putString("email", user.email)
            ?.putString("nickname", user.nickname)?.putString("avatar", user.avatar)
            ?.putLong("expiresAt", expiresAt)?.apply()
        Api.token = token
        userId = user.id
        email = user.email.takeIf { it.isNotBlank() }
        nickname = user.nickname.takeIf { it.isNotBlank() }
        avatar = user.avatar.takeIf { it.isNotBlank() }
    }

    /** Back to being a guest. */
    fun forget() {
        prefs?.edit()?.clear()?.apply()
        Api.token = null
        userId = null
        email = null
        nickname = null
        avatar = null
        expiresAt = 0L
    }

    /** A token near its end is exchanged for a fresh one while it still works. */
    suspend fun refreshIfNeeded() {
        if (!signedIn || expiresAt - now() > RENEW_BEFORE_S) return
        val fresh = try { Api.refreshToken() } catch (e: kotlinx.coroutines.CancellationException) { throw e } catch (e: Exception) { return }
        save(fresh)
    }

    private fun now() = System.currentTimeMillis() / 1000
    private const val RENEW_BEFORE_S = 7 * 24 * 3600L
}
