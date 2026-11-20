package app.kkaraoke.tv

/** The words the TV shows in Traditional Chinese, keyed by their English. A word missing here stays English. */
private val zhTW = mapOf(
    "Home" to "首頁", "Search" to "搜尋", "Library" to "曲庫", "Queue" to "待播", "Settings" to "設定",
    "Sign in" to "登入", "Play now" to "立即播放", "Play next" to "下一首播放", "Add to queue" to "加入待播",
    "Studio recording" to "錄音室版本", "Music video" to "音樂錄影帶", "Which version?" to "要哪個版本？",
    "New and ready to sing" to "最新可唱", "Top singers" to "歌唱排行", "Recent searches" to "最近搜尋",
    "Ordered before" to "之前點過", "Language" to "語言", "Name" to "名稱", "Picture" to "頭像",
    "Music videos" to "音樂錄影帶", "Ask each time" to "每次詢問", "Use studio recording" to "一律用錄音室版本",
    "Keep the video" to "保留影片", "Sign out of this TV" to "登出此電視", "Join with your phone" to "用手機加入",
    "Account" to "帳號", "Signed in" to "已登入", "Not signed in" to "未登入", "Change" to "更改",
    "Find a song" to "找歌", "Nothing found" to "找不到", "Paused" to "已暫停",
    "Songs" to "歌曲", "Albums" to "專輯", "Playlists" to "播放清單", "Try again" to "再試一次",
)

/** [english] in the language chosen in Settings. */
fun tr(english: String): String = if (Prefs.language == "zh-TW") zhTW[english] ?: english else english
