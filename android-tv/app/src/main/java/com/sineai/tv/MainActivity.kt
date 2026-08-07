package com.sineai.tv

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.speech.RecognizerIntent
import android.view.KeyEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : Activity() {

    private var webView: WebView? = null
    private var tvNavigationReady = false
    private var pendingAudioPermissionRequest: PermissionRequest? = null
    private var pendingNativeVoiceSearch = false
    private var lastDpadDispatchAt = 0L
    private val PREFS       = "sineai_prefs"
    private val KEY_URL     = "server_url"
    private val DEFAULT_URL = "https://sineai.alperates.com.tr"
    private val MIC_PERMISSION_REQUEST = 4101
    private val VOICE_SEARCH_REQUEST = 4102
    private val TV_CONTRACT_VERSION = 1

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
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = false
            userAgentString = "${userAgentString} SineAITV/1.6"
            // TV'de büyük ekran önceliği
            @Suppress("DEPRECATION")
            setRenderPriority(WebSettings.RenderPriority.HIGH)
        }

        wv.addJavascriptInterface(AndroidBridge(), "SineAIAndroid")
        wv.setBackgroundColor(Color.parseColor("#050507"))
        wv.overScrollMode = View.OVER_SCROLL_NEVER
        wv.isScrollbarFadingEnabled = true
        wv.isHorizontalScrollBarEnabled = false
        wv.isVerticalScrollBarEnabled   = false
        wv.isFocusable = true
        wv.isFocusableInTouchMode = true
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true)
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest?) {
                runOnUiThread { handleWebPermissionRequest(request) }
            }
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                return openYouTubeIfNeeded(request?.url)
            }

            @Deprecated("Deprecated in Java")
            override fun shouldOverrideUrlLoading(view: WebView?, url: String?): Boolean {
                return openYouTubeIfNeeded(url?.let(Uri::parse))
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                tvNavigationReady = false
                view?.let(::initializeTvExperience)
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

    private fun initializeTvExperience(view: WebView) {
        val remoteProbe = """
            (function() {
                var navigation = window.SineAITV;
                if (!navigation ||
                    navigation.contractVersion !== ${TV_CONTRACT_VERSION} ||
                    typeof navigation.enable !== 'function' ||
                    typeof navigation.handleNativeKey !== 'function' ||
                    typeof navigation.handleBack !== 'function') return false;

                try {
                    if (navigation.enable(true) === false) return false;
                    var cssContract = getComputedStyle(document.body)
                        .getPropertyValue('--sineai-tv-contract').trim();
                    if (cssContract !== '${TV_CONTRACT_VERSION}') {
                        navigation.enable(false);
                        return false;
                    }
                } catch (_error) {
                    try { navigation.enable(false); } catch (_ignored) {}
                    return false;
                }

                var nativeStyle = document.getElementById('sineai-native-tv-style');
                if (nativeStyle) nativeStyle.remove();
                document.documentElement.dataset.sineaiTvSource = 'remote';
                document.documentElement.dataset.sineaiTvAssetVersion = String(navigation.assetVersion || 'unknown');
                return true;
            })();
        """.trimIndent()

        view.evaluateJavascript(remoteProbe) { ready ->
            if (ready == "true") tvNavigationReady = true
            else injectBundledTvExperience(view)
        }
    }

    private fun injectBundledTvExperience(view: WebView) {
        val tvCss = readAssetText("tv.css")
        val tvNavigation = readAssetText("tv-navigation.js")
        val bundledAssetsAvailable = tvCss != null && tvNavigation != null
        val bundledCss = tvCss.orEmpty()
        val bundledNavigation = tvNavigation.orEmpty()

        val script = """
            (function() {
                var navigation = window.SineAITV;
                var remoteReady = Boolean(
                    navigation &&
                    navigation.contractVersion === ${TV_CONTRACT_VERSION} &&
                    typeof navigation.enable === 'function' &&
                    typeof navigation.handleNativeKey === 'function' &&
                    typeof navigation.handleBack === 'function'
                );

                if (remoteReady) {
                    try {
                        remoteReady = navigation.enable(true) !== false;
                        var cssContract = getComputedStyle(document.body)
                            .getPropertyValue('--sineai-tv-contract').trim();
                        remoteReady = remoteReady && cssContract === '${TV_CONTRACT_VERSION}';
                    } catch (_error) {
                        remoteReady = false;
                    }
                }

                if (remoteReady) {
                    var nativeStyle = document.getElementById('sineai-native-tv-style');
                    if (nativeStyle) nativeStyle.remove();
                    document.documentElement.dataset.sineaiTvSource = 'remote';
                    document.documentElement.dataset.sineaiTvAssetVersion = String(navigation.assetVersion || 'unknown');
                } else {
                    try {
                        if (navigation) navigation.enable(false);
                    } catch (_error) {}

                    if (!${bundledAssetsAvailable}) return false;

                    var oldStyle = document.getElementById('sineai-native-tv-style');
                    if (oldStyle) oldStyle.remove();
                    var style = document.createElement('style');
                    style.id = 'sineai-native-tv-style';
                    style.textContent = ${JSONObject.quote(bundledCss)};
                    document.head.appendChild(style);

                    $bundledNavigation

                    navigation = window.SineAITV;
                    if (!navigation || navigation.contractVersion !== ${TV_CONTRACT_VERSION}) return false;
                    document.documentElement.dataset.sineaiTvSource = 'bundled';
                    document.documentElement.dataset.sineaiTvAssetVersion = String(navigation.assetVersion || 'unknown');
                }

                (function() {
                if (window.SineAIVoiceReady) return;
                var button = document.getElementById('voiceBtn');
                var input = document.getElementById('query');
                var form = document.getElementById('recommendForm');
                var errorBox = document.getElementById('errorBox');
                if (!button || !input || !form || !window.SineAIAndroid) return;

                function setVoiceState(active, label) {
                    button.classList.toggle('listening', active);
                    button.setAttribute('aria-pressed', String(active));
                    button.textContent = label || (active ? '🎙️ Dinliyorum…' : '🎤 Sesli Arama');
                }

                window.addEventListener('sineai:voice-start', function() {
                    if (errorBox) errorBox.classList.add('hidden');
                    setVoiceState(true);
                });
                window.addEventListener('sineai:voice-result', function(event) {
                    var transcript = String((event.detail && event.detail.transcript) || '').trim();
                    setVoiceState(false);
                    if (!transcript) return;
                    input.value = transcript;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof form.requestSubmit === 'function') form.requestSubmit();
                    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                });
                window.addEventListener('sineai:voice-cancelled', function() {
                    setVoiceState(false);
                });
                window.addEventListener('sineai:voice-error', function(event) {
                    setVoiceState(false);
                    if (!errorBox) return;
                    errorBox.textContent = (event.detail && event.detail.message) || 'Sesli arama başlatılamadı.';
                    errorBox.classList.remove('hidden');
                });
                button.addEventListener('click', function() {
                    setVoiceState(true, '🎙️ Hazırlanıyor…');
                    window.SineAIAndroid.startVoiceSearch();
                });
                window.SineAIVoiceReady = true;
                })();

                return Boolean(window.SineAITV && window.SineAITV.enable(true));
            })();
        """.trimIndent()

        view.evaluateJavascript(script) { ready -> tvNavigationReady = ready == "true" }
    }

    private fun readAssetText(name: String): String? {
        return runCatching {
            assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }
        }.getOrNull()
    }

    inner class AndroidBridge {
        @JavascriptInterface
        fun startVoiceSearch() {
            runOnUiThread { beginNativeVoiceSearch() }
        }

        @JavascriptInterface
        fun requestMicrophonePermission() {
            runOnUiThread { requestMicrophonePermissionFromUser() }
        }

        @JavascriptInterface
        fun hasMicrophonePermission(): Boolean = this@MainActivity.hasMicrophonePermission()
    }

    private fun beginNativeVoiceSearch() {
        if (!hasMicrophonePermission()) {
            pendingNativeVoiceSearch = true
            requestMicrophonePermissionFromUser()
            return
        }

        launchNativeVoiceRecognizer()
    }

    private fun launchNativeVoiceRecognizer() {
        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, "tr-TR")
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "tr-TR")
            putExtra(RecognizerIntent.EXTRA_PROMPT, "Ne izlemek istediğinizi söyleyin")
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
        }

        try {
            dispatchWebEvent("sineai:voice-start")
            @Suppress("DEPRECATION")
            startActivityForResult(intent, VOICE_SEARCH_REQUEST)
        } catch (_: ActivityNotFoundException) {
            dispatchVoiceError("Bu TV'de kullanılabilir bir ses tanıma hizmeti bulunamadı.")
        } catch (_: Exception) {
            dispatchVoiceError("Sesli arama başlatılamadı. Lütfen tekrar deneyin.")
        }
    }

    private fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestMicrophonePermissionFromUser() {
        if (hasMicrophonePermission()) {
            dispatchMicrophonePermission(true)
            return
        }

        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.RECORD_AUDIO),
            MIC_PERMISSION_REQUEST
        )
    }

    private fun handleWebPermissionRequest(request: PermissionRequest?) {
        val resources = request?.resources ?: return
        val wantsAudio = resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)
        if (!wantsAudio) {
            request.deny()
            return
        }

        if (!hasMicrophonePermission()) {
            pendingAudioPermissionRequest = request
            requestMicrophonePermissionFromUser()
            return
        }

        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
    }

    private fun dispatchMicrophonePermission(granted: Boolean) {
        dispatchWebEvent(
            "sineai:microphone-permission",
            JSONObject().put("granted", granted)
        )
    }

    private fun dispatchVoiceError(message: String) {
        dispatchWebEvent("sineai:voice-error", JSONObject().put("message", message))
    }

    private fun dispatchWebEvent(name: String, detail: JSONObject = JSONObject()) {
        val script = "window.dispatchEvent(new CustomEvent(${JSONObject.quote(name)}, {detail: $detail}));"
        webView?.evaluateJavascript(script, null)
    }

    private fun openYouTubeIfNeeded(uri: Uri?): Boolean {
        if (uri == null || !isYouTubeUri(uri)) return false
        return openYouTube(uri)
    }

    private fun isYouTubeUri(uri: Uri): Boolean {
        val host = uri.host?.lowercase() ?: return false
        return host == "youtu.be" ||
            host == "youtube.com" ||
            host.endsWith(".youtube.com")
    }

    private fun extractYouTubeVideoId(uri: Uri): String? {
        val host = uri.host?.lowercase().orEmpty()
        if (host == "youtu.be") return uri.pathSegments.firstOrNull()

        val watchId = uri.getQueryParameter("v")
        if (!watchId.isNullOrBlank()) return watchId

        val pathSegments = uri.pathSegments
        if (pathSegments.size >= 2 && pathSegments[0] in listOf("embed", "shorts")) {
            return pathSegments[1]
        }

        return null
    }

    private fun openYouTube(uri: Uri): Boolean {
        val videoId = extractYouTubeVideoId(uri)
        val appUris = listOfNotNull(videoId?.let { Uri.parse("vnd.youtube:$it") }, uri)
        val packages = listOf("com.google.android.youtube.tv", "com.google.android.youtube")

        for (packageName in packages) {
            for (targetUri in appUris) {
                val intent = Intent(Intent.ACTION_VIEW, targetUri).apply {
                    setPackage(packageName)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                if (intent.resolveActivity(packageManager) != null) {
                    try {
                        startActivity(intent)
                        return true
                    } catch (_: ActivityNotFoundException) {
                        // Try the next YouTube package or URI fallback.
                    }
                }
            }
        }

        val fallbackIntent = Intent(Intent.ACTION_VIEW, uri).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return if (fallbackIntent.resolveActivity(packageManager) != null) {
            startActivity(fallbackIntent)
            true
        } else {
            false
        }
    }

    private fun sendTvDirection(direction: String, event: KeyEvent? = null): Boolean {
        if (!tvNavigationReady) return false

        if (direction != "select") {
            val now = SystemClock.uptimeMillis()
            if ((event?.repeatCount ?: 0) > 0 && now - lastDpadDispatchAt < 65L) return true
            lastDpadDispatchAt = now
        }

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
            KeyEvent.KEYCODE_DPAD_UP    -> return sendTvDirection("up", event)
            KeyEvent.KEYCODE_DPAD_DOWN  -> return sendTvDirection("down", event)
            KeyEvent.KEYCODE_DPAD_LEFT  -> return sendTvDirection("left", event)
            KeyEvent.KEYCODE_DPAD_RIGHT -> return sendTvDirection("right", event)
            KeyEvent.KEYCODE_DPAD_CENTER,
            KeyEvent.KEYCODE_ENTER,
            KeyEvent.KEYCODE_NUMPAD_ENTER,
            KeyEvent.KEYCODE_BUTTON_A -> {
                if ((event?.repeatCount ?: 0) > 0) return true
                if (sendTvDirection("select")) return true
            }
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

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != MIC_PERMISSION_REQUEST) return

        val granted = grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED
        if (granted) {
            pendingAudioPermissionRequest?.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
        } else {
            pendingAudioPermissionRequest?.deny()
        }
        pendingAudioPermissionRequest = null
        dispatchMicrophonePermission(granted)

        if (pendingNativeVoiceSearch) {
            pendingNativeVoiceSearch = false
            if (granted) {
                launchNativeVoiceRecognizer()
            } else {
                dispatchVoiceError("Mikrofon izni verilmedi. TV ayarlarından SineAI için mikrofon iznini açın.")
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != VOICE_SEARCH_REQUEST) return

        if (resultCode == RESULT_OK) {
            val transcript = data
                ?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)
                ?.firstOrNull()
                ?.trim()

            if (!transcript.isNullOrEmpty()) {
                dispatchWebEvent(
                    "sineai:voice-result",
                    JSONObject().put("transcript", transcript)
                )
                return
            }
        }

        dispatchWebEvent("sineai:voice-cancelled")
    }

    override fun onResume() {
        super.onResume()
        webView?.onResume()
    }

    override fun onPause() {
        webView?.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        webView?.removeJavascriptInterface("SineAIAndroid")
        webView?.destroy()
        super.onDestroy()
    }
}
