package tv.retro.app

import android.annotation.SuppressLint
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

/**
 * A full-screen WebView pointed at the Retro TV server on the home network.
 * The web app does everything; this wrapper only gives it a launcher icon,
 * autoplay, keep-screen-on, and the remote's Back and channel keys.
 */
class MainActivity : Activity() {

    private var webView: WebView? = null

    private val prefs by lazy { getSharedPreferences("retro-tv", MODE_PRIVATE) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val server = prefs.getString(KEY_SERVER, null)
        if (server == null) showSetup(null) else showTv(server)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun showTv(server: String) {
        val view = WebView(this).apply {
            setBackgroundColor(Color.BLACK)
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.useWideViewPort = true
            settings.loadWithOverviewMode = true
            isFocusable = true
            isFocusableInTouchMode = true
            webViewClient = object : WebViewClient() {
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    // Only the page itself failing means the server is unreachable; a broken video is the app's problem.
                    // Posted: tearing down the WebView inside its own callback isn't safe.
                    if (request.isForMainFrame) view.post { showSetup("Couldn't reach $server (${error.description})") }
                }
            }
        }
        webView?.destroy()
        webView = view
        setContentView(view)
        hideSystemUi()
        view.loadUrl("${server.trimEnd('/')}/?tv=1")
        view.requestFocus()
    }

    private fun showSetup(message: String?) {
        webView?.destroy()
        webView = null

        val pad = (32 * resources.displayMetrics.density).toInt()
        val title = TextView(this).apply {
            text = "Retro TV setup"
            textSize = 28f
            setTextColor(Color.parseColor("#FFD23F"))
        }
        val help = TextView(this).apply {
            text = (message?.let { "$it\n\n" } ?: "") +
                "Enter the address of the Retro TV server on your home network, " +
                "e.g. http://192.168.1.50:8420"
            textSize = 18f
            setTextColor(Color.WHITE)
            setPadding(0, pad / 2, 0, pad / 2)
        }
        val input = EditText(this).apply {
            setText(prefs.getString(KEY_SERVER, null) ?: "http://")
            setSelection(text.length)
            textSize = 22f
            setTextColor(Color.WHITE)
            isSingleLine = true
            inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
            imeOptions = EditorInfo.IME_ACTION_GO
        }
        val save = Button(this).apply { text = "Connect" }

        fun connect() {
            var url = input.text.toString().trim()
            if (!url.startsWith("http://") && !url.startsWith("https://")) url = "http://$url"
            prefs.edit().putString(KEY_SERVER, url.trimEnd('/')).apply()
            showTv(url)
        }
        save.setOnClickListener { connect() }
        input.setOnEditorActionListener { _, _, _ -> connect(); true }

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(pad * 3, pad, pad * 3, pad)
            setBackgroundColor(Color.parseColor("#1C0A57"))
            addView(title)
            addView(help)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(save, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(layout)
        input.requestFocus()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val view = webView ?: return super.dispatchKeyEvent(event)
        when (event.keyCode) {
            KeyEvent.KEYCODE_BACK -> {
                // Let the web app close its panels first; exit only if it didn't use the key.
                if (event.action == KeyEvent.ACTION_UP) {
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
        if (hasFocus) hideSystemUi()
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
    }
}
