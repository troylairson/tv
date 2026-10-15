package tv.retro.app

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * A full-screen WebView pointed at the Retro TV server on the home network.
 * The web app does everything; this wrapper gives it a launcher icon, autoplay,
 * keep-screen-on and the remote's keys, plus a setup screen that finds the
 * server on the network and never leaves the TV on a black screen.
 */
class MainActivity : Activity() {

    private var webView: WebView? = null
    /** True once the web app has actually started (not just the page loaded). */
    private var appReady = false
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newCachedThreadPool()
    /** Bumped whenever the screen changes, so stale background results are ignored. */
    private var generation = 0
    private var lastConsoleError: String? = null

    private val prefs by lazy { getSharedPreferences("retro-tv", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val server = prefs.getString(KEY_SERVER, null)
        if (server == null) showSetup(null) else connect(server)
    }

    // ── Connecting ───────────────────────────────────────────────────────────

    /** Check the server answers before handing the screen to the WebView. */
    private fun connect(server: String) {
        val gen = ++generation
        showStatus("Connecting to $server …")
        io.execute {
            val error = probe(server, timeoutMs = 4000)
            main.post {
                if (gen != generation) return@post
                if (error == null) showTv(server) else showSetup("Couldn't reach $server: $error")
            }
        }
    }

    /** null if a Retro TV server answers at this address, else what went wrong. */
    private fun probe(server: String, timeoutMs: Int): String? = try {
        val conn = URL("${server.trimEnd('/')}/api/info").openConnection() as HttpURLConnection
        conn.connectTimeout = timeoutMs
        conn.readTimeout = timeoutMs
        try {
            val code = conn.responseCode
            if (code != 200) "the server answered HTTP $code"
            else {
                val body = conn.inputStream.bufferedReader().use { it.readText() }
                if (body.contains("\"app\":\"retro-tv\"") || body.contains("\"plexConfigured\"")) null
                else "something answered, but it isn't Retro TV"
            }
        } finally {
            conn.disconnect()
        }
    } catch (e: java.net.SocketTimeoutException) {
        "no answer (timed out). Is the address right and the laptop on?"
    } catch (e: java.net.ConnectException) {
        "connection refused. Is the Retro TV container running?"
    } catch (e: java.net.UnknownHostException) {
        "unknown address"
    } catch (e: Exception) {
        e.message ?: e.javaClass.simpleName
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showTv(server: String) {
        val gen = ++generation
        appReady = false
        lastConsoleError = null
        val view = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            isFocusable = true
            isFocusableInTouchMode = true
            addJavascriptInterface(Bridge(), "RetroTVApp")
            webChromeClient = object : WebChromeClient() {
                override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                    if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) lastConsoleError = message.message()
                    return super.onConsoleMessage(message)
                }
            }
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    // Only the page itself failing means the server is unreachable; a broken video is the app's problem.
                    // Posted: tearing down the WebView inside its own callback isn't safe.
                    if (request.isForMainFrame) view.post { showSetup("Couldn't load $server (${error.description})") }
                }

                override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                    if (request.isForMainFrame) view.post { showSetup("$server answered HTTP ${response.statusCode}") }
                }

                override fun onPageFinished(view: WebView, url: String) {
                    // The page loaded; give the app a few seconds to start, then make sure it did.
                    main.postDelayed({ checkStarted(gen) }, 6000)
                }
            }
        }
        webView?.destroy()
        webView = view
        setContentView(view)
        hideSystemUi()
        view.loadUrl("${server.trimEnd('/')}/?tv=1")
        view.requestFocus()
        // Never sit on a black screen: if nothing has loaded in 25 s, go back to setup.
        main.postDelayed({
            if (gen == generation && !appReady) checkStarted(gen, timedOut = true)
        }, 25_000)
    }

    /** Is the web app running? If not, say why on the setup screen instead of showing black. */
    private fun checkStarted(gen: Int, timedOut: Boolean = false) {
        val view = webView ?: return
        if (gen != generation || appReady) return
        view.evaluateJavascript("(document.querySelector('.tv') ? 'ok' : 'no')") { result ->
            if (gen != generation) return@evaluateJavascript
            if (result == "\"ok\"") {
                appReady = true
                return@evaluateJavascript
            }
            val webViewVersion = WebView.getCurrentWebViewPackage()?.versionName ?: "unknown"
            val why = lastConsoleError?.let { "\n\nError: $it" } ?: ""
            showSetup(
                (if (timedOut) "The TV app didn't load in time." else "The page loaded, but the TV app didn't start.") +
                    " Android System WebView is version $webViewVersion; if it's old, update it from the Play Store." + why,
            )
        }
    }

    /** Lets the web app's Settings send you back here to change the server address. */
    private inner class Bridge {
        @JavascriptInterface
        fun changeServer() {
            main.post { showSetup(null) }
        }

        @JavascriptInterface
        fun server(): String = prefs.getString(KEY_SERVER, "") ?: ""
    }

    // ── Setup screen ─────────────────────────────────────────────────────────

    private fun showStatus(text: String) {
        webView?.destroy()
        webView = null
        val label = TextView(this).apply {
            this.text = text
            textSize = 24f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#1C0A57"))
        }
        setContentView(label)
    }

    private fun showSetup(message: String?) {
        val gen = ++generation
        webView?.destroy()
        webView = null
        appReady = false

        val density = resources.displayMetrics.density
        val pad = (32 * density).toInt()
        val gap = (12 * density).toInt()

        val title = TextView(this).apply {
            text = "Retro TV setup"
            textSize = 30f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#FFD23F"))
        }
        val error = TextView(this).apply {
            text = message ?: ""
            visibility = if (message == null) View.GONE else View.VISIBLE
            textSize = 18f
            setTextColor(Color.parseColor("#FF8A80"))
            setPadding(0, gap, 0, 0)
        }
        val foundLabel = TextView(this).apply {
            text = "Looking for Retro TV on your network…"
            textSize = 20f
            setTextColor(Color.WHITE)
            setPadding(0, pad / 2, 0, gap / 2)
        }
        val found = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val manualLabel = TextView(this).apply {
            text = "Or type the address, e.g. http://192.168.1.50:8420"
            textSize = 18f
            setTextColor(Color.parseColor("#C8C8E8"))
            setPadding(0, pad / 2, 0, gap / 2)
        }
        val input = EditText(this).apply {
            setText(prefs.getString(KEY_SERVER, null) ?: "http://")
            setSelection(text.length)
            textSize = 24f
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            hint = "http://192.168.1.50:8420"
            // Plain visible text: some TV keyboards mask URI fields. No full-screen keyboard,
            // so the field (and the preview below) stay on screen while typing.
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            transformationMethod = null
            isSingleLine = true
            imeOptions = EditorInfo.IME_ACTION_GO or EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN
            background = GradientDrawable().apply {
                setColor(Color.parseColor("#2A1A6E"))
                setStroke((2 * density).toInt(), Color.parseColor("#6D7DFF"))
                cornerRadius = 8 * density
            }
            setPadding(gap, gap, gap, gap)
        }
        val preview = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.parseColor("#FFD23F"))
            setPadding(0, gap / 2, 0, gap)
        }
        fun normalized(): String {
            var url = input.text.toString().trim()
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
            return url.trimEnd('/')
        }
        fun updatePreview() {
            preview.text = "Will connect to: ${normalized()}"
        }
        updatePreview()
        input.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) = updatePreview()
        })

        fun use(server: String) {
            prefs.edit().putString(KEY_SERVER, server).apply()
            connect(server)
        }
        val save = Button(this).apply { text = "Connect" }
        save.setOnClickListener { use(normalized()) }
        input.setOnEditorActionListener { _, _, _ -> use(normalized()); true }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad * 3, pad, pad * 3, pad)
            addView(title)
            addView(error)
            addView(foundLabel)
            addView(found)
            addView(manualLabel)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(preview)
            addView(save, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#1C0A57"))
            isFillViewport = true
            addView(layout)
        }
        setContentView(scroll)
        save.requestFocus()

        // Look for servers on the local network and offer each one as a button.
        discover { servers ->
            if (gen != generation) return@discover
            if (servers.isEmpty()) {
                foundLabel.text = "No Retro TV server found on this network automatically."
                return@discover
            }
            foundLabel.text = if (servers.size == 1) "Found your Retro TV server:" else "Found these Retro TV servers:"
            for (server in servers) {
                val button = Button(this).apply {
                    text = "Use $server"
                    textSize = 20f
                    setOnClickListener { use(server) }
                }
                found.addView(button, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            }
            (found.getChildAt(0) as? Button)?.requestFocus()
        }
    }

    /** Try every address on this device's /24 subnet at the default port, in parallel. */
    private fun discover(done: (List<String>) -> Unit) {
        io.execute {
            val results = mutableListOf<String>()
            try {
                val cm = getSystemService(ConnectivityManager::class.java)
                val link = cm?.getLinkProperties(cm.activeNetwork)
                val own = link?.linkAddresses?.map { it.address }?.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
                if (own != null) {
                    val prefix = own.hostAddress!!.substringBeforeLast('.')
                    val pool = Executors.newFixedThreadPool(48)
                    for (host in 1..254) {
                        val server = "http://$prefix.$host:$DEFAULT_PORT"
                        pool.execute { if (probe(server, timeoutMs = 700) == null) synchronized(results) { results.add(server) } }
                    }
                    pool.shutdown()
                    pool.awaitTermination(20, TimeUnit.SECONDS)
                }
            } catch (e: Exception) {
                // No network info: manual entry still works.
            }
            val sorted = synchronized(results) { results.sorted() }
            main.post { done(sorted) }
        }
    }

    // ── Keys and lifecycle ───────────────────────────────────────────────────

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val view = webView ?: return super.dispatchKeyEvent(event)
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                if (event.action == KeyEvent.ACTION_UP) {
                    // Before the TV has started, Back means "take me back to setup".
                    if (!appReady) {
                        showSetup(null)
                        return true
                    }
                    // Let the web app close its panels first; exit only if it didn't use the key.
                    view.evaluateJavascript("(window.__retroTvBack ? window.__retroTvBack() : false)") { handled ->
                        if (handled != "true") finish()
                    }
                }
                return true
            }
            // Menu or Settings key (on remotes that have one) changes the server address.
            KeyEvent.KEYCODE_MENU, KeyEvent.KEYCODE_SETTINGS -> {
                if (event.action == KeyEvent.ACTION_UP) showSetup(null)
                return true
            }
            // WebView doesn't reliably turn these into DOM key events, so forward them by name.
            KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_CHANNEL_DOWN -> {
                if (event.action == KeyEvent.ACTION_DOWN) {
                    val key = if (event.keyCode == KeyEvent.KEYCODE_CHANNEL_UP) "ChannelUp" else "ChannelDown"
                    view.evaluateJavascript(
                        "window.dispatchEvent(new KeyboardEvent('keydown', {key: '$key'}))", null,
                    )
                }
                return true
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && webView != null) hideSystemUi()
    }

    override fun onPause() {
        super.onPause()
        webView?.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onDestroy() {
        generation++
        io.shutdownNow()
        webView?.destroy()
        webView = null
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
    }

    companion object {
        private const val KEY_SERVER = "server"
        private const val DEFAULT_PORT = 8420
    }
}
