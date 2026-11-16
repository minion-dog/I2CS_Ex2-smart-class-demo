package il.ac.ariel.smartclass.ui;

import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.annotation.Nullable;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.ai.Groq;

/**
 * Lecturer settings: the Groq key (kept only on this phone). The language switch is in the
 * menu of every screen.
 */
public class SettingsActivity extends BaseActivity
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
        Ui.title(col, getString(R.string.settings));
        Ui.text(col, getString(R.string.groq_key));
        final EditText key = Ui.field(col, "gsk_…");
        key.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        key.setText(Groq.key(this));
        Ui.button(col, getString(R.string.ok), new View.OnClickListener()
        {
            @Override
            public void onClick(View v)
            {
                Groq.saveKey(SettingsActivity.this, key.getText().toString());
                Ui.toast(SettingsActivity.this, getString(R.string.saved));
            }
        });
    }
}
