package com.sineai.tv

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {

    private var webView: WebView? = null
    private var tvNavigationReady = false
    private val PREFS       = "sineai_prefs"
    private val KEY_URL     = "server_url"
    private val DEFAULT_URL = "https://sineai.alperates.com.tr"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url   = prefs.getString(KEY_URL, DEFAULT_URL) ?: DEFAULT_URL
        setupWebView(url)
    }

    private fun showUrlDialog(prefs: SharedPreferences) {
        val px = (16 * resources.displayMetrics.density).toInt()

        val label = TextView(this).apply {
            text = "SineAI sunucu adresini girin.\nVarsayılan: $DEFAULT_URL"
            setTextColor(Color.LTGRAY)
            setPadding(px, px / 2, px, px / 2)
        }

        val input = EditText(this).apply {
            setText(prefs.getString(KEY_URL, DEFAULT_URL))
            setTextColor(Color.WHITE)
            setHintTextColor(Color.GRAY)
            selectAll()
            setPadding(px, px / 2, px, px / 2)
        }

        AlertDialog.Builder(this)
            .setTitle("Sunucu Adresi")
            .setView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(px, px, px, 0)
                addView(label)
                addView(input)
            })
            .setPositiveButton("Bağlan") { _, _ ->
                var url = input.text.toString().trim()
                if (!url.startsWith("http")) url = "https://$url"
                prefs.edit().putString(KEY_URL, url).apply()
                setupWebView(url)
            }
            .setNeutralButton("Varsayılan") { _, _ ->
                prefs.edit().putString(KEY_URL, DEFAULT_URL).apply()
                setupWebView(DEFAULT_URL)
            }
            .setCancelable(true)
            .show()
    }

    private fun setupWebView(url: String) {
        val wv = WebView(this).also { webView = it }

        // Backdrop-filter blur ve animasyonlar için hardware acceleration
        wv.setLayerType(View.LAYER_TYPE_HARDWARE, null)

        wv.settings.apply {
            javaScriptEnabled              = true
            domStorageEnabled              = true
            mediaPlaybackRequiresUserGesture = false
            useWideViewPort                = true
            loadWithOverviewMode           = true
            cacheMode                      = WebSettings.LOAD_DEFAULT
            textZoom                       = 100
            // TV'de büyük ekran önceliği
            @Suppress("DEPRECATION")
            setRenderPriority(WebSettings.RenderPriority.HIGH)
        }

        wv.setBackgroundColor(Color.parseColor("#0d0d1a"))
        wv.isScrollbarFadingEnabled = true
        wv.isHorizontalScrollBarEnabled = false
        wv.isVerticalScrollBarEnabled   = false
        wv.isFocusable = true
        wv.isFocusableInTouchMode = true

        wv.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                tvNavigationReady = false
                view?.evaluateJavascript(
                    """
                    (function() {
                        if (!window.SineAITV) return false;
                        window.SineAITV.enable(true);
                        return true;
                    })();
                    """.trimIndent()
                ) { ready -> tvNavigationReady = ready == "true" }
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                if (request?.isForMainFrame == true) {
                    val currentUrl = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_URL, DEFAULT_URL)
                    view?.loadData(
                        """<!DOCTYPE html><html><body style="
                            background:#0d0d1a;color:#e2e8f0;
                            font-family:-apple-system,BlinkMacSystemFont,sans-serif;
                            display:flex;align-items:center;justify-content:center;
                            height:100vh;flex-direction:column;gap:24px;
                            text-align:center;margin:0;padding:24px;box-sizing:border-box">
                           <div style="font-size:48px">⚠️</div>
                           <h2 style="font-size:24px;font-weight:800;color:#a78bfa">Bağlantı Kurulamadı</h2>
                           <p style="color:#94a3b8;font-size:15px">$currentUrl</p>
                           <button onclick="location.reload()" style="
                               padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#a855f7);
                               color:#fff;border:none;border-radius:12px;
                               font-size:16px;font-weight:700;cursor:pointer">
                             Tekrar Dene
                           </button>
                           </body></html>""",
                        "text/html", "utf-8"
                    )
                }
            }
        }

        setContentView(wv)
        wv.requestFocus()
        wv.loadUrl(url)
    }

    private fun sendTvDirection(direction: String): Boolean {
        if (!tvNavigationReady) return false

        webView?.evaluateJavascript(
            "window.SineAITV && window.SineAITV.handleNativeKey('$direction');",
            null
        )
        return true
    }

    private fun handleBackPress() {
        val wv = webView ?: run {
            finish()
            return
        }

        wv.evaluateJavascript(
            "window.SineAITV && window.SineAITV.handleBack ? window.SineAITV.handleBack() : false;"
        ) { handled ->
            if (handled != "true") {
                if (wv.canGoBack()) wv.goBack() else finish()
            }
        }
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent?): Boolean {
        when (keyCode) {
            KeyEvent.KEYCODE_DPAD_UP    -> return sendTvDirection("up")
            KeyEvent.KEYCODE_DPAD_DOWN  -> return sendTvDirection("down")
            KeyEvent.KEYCODE_DPAD_LEFT  -> return sendTvDirection("left")
            KeyEvent.KEYCODE_DPAD_RIGHT -> return sendTvDirection("right")
        }

        if (keyCode == KeyEvent.KEYCODE_BACK) {
            event?.startTracking()
            return true
        }
        return super.onKeyDown(keyCode, event)
    }

    override fun onKeyUp(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            if (event?.isCanceled != true) handleBackPress()
            return true
        }
        return super.onKeyUp(keyCode, event)
    }

    // TV remote'da Back'e uzun basınca sunucu adresini değiştir
    override fun onKeyLongPress(keyCode: Int, event: KeyEvent?): Boolean {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            showUrlDialog(getSharedPreferences(PREFS, Context.MODE_PRIVATE))
            return true
        }
        return super.onKeyLongPress(keyCode, event)
    }

    override fun onDestroy() {
        webView?.destroy()
        super.onDestroy()
    }
}
