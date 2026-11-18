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
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;
import android.app.Activity;

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
            .addOnFailureListener(e -> call.reject(explain(e)));
    }

    private void onConsentResult(ActivityResult activityResult) {
        PluginCall call = pending;
        pending = null;
        if (call == null) return;
        if (activityResult.getData() == null) {
            call.reject(activityResult.getResultCode() == Activity.RESULT_CANCELED
                ? "A janela do Google foi fechada sem concluir (código " + activityResult.getResultCode() + "). Se você não cancelou, confira a credencial Android (pacote e SHA-1) e se seu e-mail é usuário de teste ou o app está publicado."
                : "O Google não devolveu resposta (código " + activityResult.getResultCode() + ").");
            return;
        }
        try {
            AuthorizationResult result = Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(activityResult.getData());
            resolveToken(call, result);
        } catch (ApiException e) {
            call.reject(explain(e));
        }
    }

    private String explain(Exception e) {
        if (e instanceof ApiException) {
            int code = ((ApiException) e).getStatusCode();
            String why;
            switch (code) {
                case CommonStatusCodes.DEVELOPER_ERROR:
                    why = "Credencial Android não encontrada: no Google Cloud, crie um ID do cliente OAuth do tipo Android com o pacote io.github.guigon96.tinteiro e o SHA-1 62:12:B2:02:7B:85:C4:4A:F0:50:EF:2E:81:30:B5:AD:E0:95:6C:98 (no MESMO projeto onde a Drive API está ativada).";
                    break;
                case CommonStatusCodes.CANCELED:
                case 12501:
                    why = "Login cancelado na tela do Google.";
                    break;
                case CommonStatusCodes.NETWORK_ERROR:
                    why = "Sem internet ou o Google não respondeu.";
                    break;
                case CommonStatusCodes.SIGN_IN_REQUIRED:
                    why = "Nenhuma conta Google neste tablet — adicione uma em Configurações do Android.";
                    break;
                default:
                    why = "Erro do Google";
            }
            return why + " [código " + code + ": " + e.getMessage() + "]";
        }
        return "Falha no login do Google: " + e.getMessage();
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
