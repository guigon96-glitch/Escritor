package io.github.guigon96.tinteiro;

import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

/**
 * Login do Google Drive pelo sistema de contas do Android (Google Identity AuthorizationClient).
 * Pede apenas a permissão drive.file e devolve um access token para o app web.
 */
@CapacitorPlugin(name = "DriveAuth")
public class DriveAuthPlugin extends Plugin {
    private static final String SCOPE = "https://www.googleapis.com/auth/drive.file";
    private PluginCall pending;
    private ActivityResultLauncher<IntentSenderRequest> launcher;

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            this::onConsentResult
        );
    }

    private AuthorizationRequest request() {
        return AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(SCOPE)))
            .build();
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", true));
        Identity.getAuthorizationClient(getActivity())
            .authorize(request())
            .addOnSuccessListener(result -> {
                if (result.hasResolution()) {
                    if (!interactive || result.getPendingIntent() == null) {
                        call.reject("NEEDS_LOGIN");
                        return;
                    }
                    pending = call;
                    IntentSenderRequest req = new IntentSenderRequest.Builder(result.getPendingIntent().getIntentSender()).build();
                    launcher.launch(req);
                } else {
                    resolveToken(call, result);
                }
            })
            .addOnFailureListener(e -> call.reject("Falha no login do Google: " + e.getMessage()));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            resolveToken(call, result);
        } catch (ApiException e) {
            call.reject("Login cancelado");
        }
    }

    private void resolveToken(PluginCall call, AuthorizationResult result) {
        String token = result.getAccessToken();
        if (token == null) {
            call.reject("O Google não devolveu um token");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("access_token", token);
        ret.put("expires_in", 3300);
        call.resolve(ret);
    }
}
