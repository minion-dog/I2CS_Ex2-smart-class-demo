package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.firebase.FirebaseApp;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.data.Repo;

/**
 * The launcher: sends the user to the right home screen by role, or to the login screen.
 */
public class MainActivity extends AppCompatActivity
{
    /**
     * Decides where to go.
     * @param (Bundle) saved Saved state (unused).
     */
    @Override
    protected void onCreate(@Nullable Bundle saved)
    {
        super.onCreate(saved);
        if (FirebaseApp.getApps(this).isEmpty())
        {
            showNotSetUp();
            return;
        }
        Ui.text(Ui.screen(this), getString(R.string.working));
        if (Repo.get().user() == null)
        {
            go(this, LoginActivity.class);
            return;
        }
        Repo.get().resolveRole(new Repo.Done<String>()
        {
            @Override
            public void onDone(@Nullable String role, @Nullable Exception error)
            {
                route(MainActivity.this, role);
            }
        });
    }

    /**
     * Firebase is not set up yet (no google-services.json): explains it and opens the
     * website from the local server instead, where everything already works.
     */
    private void showNotSetUp()
    {
        final SharedPreferences prefs = getSharedPreferences("smartclass", MODE_PRIVATE);
        LinearLayout s = Ui.screen(this);
        Ui.title(s, getString(R.string.not_set_up_title));
        Ui.text(s, getString(R.string.not_set_up_text));
        final EditText address = Ui.field(s, getString(R.string.server_address_hint));
        address.setText(prefs.getString("server", ""));
        Ui.button(s, getString(R.string.open_website), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                openWebsite(prefs, address.getText().toString().trim());
            }
        });
    }

    /**
     * Opens the local server's website in the phone's browser and remembers the address.
     * @param (SharedPreferences) prefs Where the address is remembered.
     * @param (String) typed What the user typed, e.g. 192.168.1.20:8443.
     */
    private void openWebsite(SharedPreferences prefs, String typed)
    {
        if (typed.isEmpty())
        {
            Ui.toast(this, getString(R.string.server_address_hint));
            return;
        }
        String url = typed.startsWith("https://") ? typed : "https://" + typed;
        if (!url.contains("lan=1"))
        {
            url = url + (url.contains("?") ? "&" : "/?") + "lan=1";
        }
        prefs.edit().putString("server", typed).apply();
        startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
    }

    /**
     * Opens the home screen of a role (or the login screen when not on the list).
     * @param (AppCompatActivity) from The current screen (closed afterwards).
     * @param (String) role The role.
     */
    static void route(AppCompatActivity from, @Nullable String role)
    {
        if (Repo.LECTURER.equals(role))
        {
            go(from, LecturerHomeActivity.class);
        }
        else if (Repo.STUDENT.equals(role))
        {
            go(from, StudentHomeActivity.class);
        }
        else
        {
            Ui.toast(from, from.getString(R.string.not_on_list) + " (" + Repo.get().myEmail() + ")");
            Repo.get().signOut();
            go(from, LoginActivity.class);
        }
    }

    /**
     * Opens a screen and closes the current one.
     * @param (AppCompatActivity) from Current screen.
     * @param (Class&lt;?&gt;) to Target screen.
     */
    private static void go(AppCompatActivity from, Class<?> to)
    {
        from.startActivity(new Intent(from, to));
        from.finish();
    }
}
