package il.ac.ariel.smartclass.ui;

import android.os.Bundle;
import android.os.CancellationSignal;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.android.libraries.identity.googleid.GetGoogleIdOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.AuthResult;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.GoogleAuthProvider;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.data.Repo;

/**
 * Sign-in. Students: Google, with the email that is on the Moodle class list (decision Q8).
 * Lecturer: email + password (an account made by hand in the Firebase console).
 */
public class LoginActivity extends AppCompatActivity
{
    /**
     * Builds the screen.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        LinearLayout col = Ui.screen(this);
        Ui.title(col, getString(R.string.login_title));
        Ui.text(col, getString(R.string.login_student));
        Ui.button(col, getString(R.string.login_google), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                signInWithGoogle();
            }
        });
        Ui.title(col, getString(R.string.login_lecturer));
        final EditText email = Ui.field(col, getString(R.string.email));
        email.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        final EditText pass = Ui.field(col, getString(R.string.password));
        pass.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        Ui.button(col, getString(R.string.enter), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                FirebaseAuth.getInstance()
                    .signInWithEmailAndPassword(email.getText().toString().trim(), pass.getText().toString())
                    .addOnCompleteListener(afterSignIn());
            }
        });
    }

    /** Asks Android for the user's Google account and signs in to Firebase with it. */
    private void signInWithGoogle()
    {
        GetGoogleIdOption option = new GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(getString(R.string.default_web_client_id))
            .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        CredentialManager.create(this).getCredentialAsync(this, request, new CancellationSignal(),
            ContextCompat.getMainExecutor(this),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>()
            {
                @Override
                public void onResult(GetCredentialResponse response)
                {
                    Credential c = response.getCredential();
                    if (c instanceof CustomCredential
                        && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(c.getType()))
                    {
                        GoogleIdTokenCredential g = GoogleIdTokenCredential.createFrom(c.getData());
                        AuthCredential fc = GoogleAuthProvider.getCredential(g.getIdToken(), null);
                        FirebaseAuth.getInstance().signInWithCredential(fc).addOnCompleteListener(afterSignIn());
                    }
                }

                @Override
                public void onError(@NonNull GetCredentialException e)
                {
                    Ui.toast(LoginActivity.this, getString(R.string.error) + ": " + e.getMessage());
                }
            });
    }

    /**
     * After a sign-in: find the role and open the right screen.
     * @return (OnCompleteListener&lt;AuthResult&gt;) The listener.
     */
    private OnCompleteListener<AuthResult> afterSignIn()
    {
        return new OnCompleteListener<AuthResult>()
        {
            @Override
            public void onComplete(@NonNull Task<AuthResult> t)
            {
                if (!t.isSuccessful())
                {
                    String msg = "";
                    if (t.getException() != null)
                    {
                        msg = t.getException().getMessage();
                    }
                    Ui.toast(LoginActivity.this, getString(R.string.error) + ": " + msg);
                    return;
                }
                Repo.get().resolveRole(new Repo.Done<String>()
                {
                    @Override
                    public void onDone(@Nullable String role, @Nullable Exception error)
                    {
                        MainActivity.route(LoginActivity.this, role);
                    }
                });
            }
        };
    }
}
