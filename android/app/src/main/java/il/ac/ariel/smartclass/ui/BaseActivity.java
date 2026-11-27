package il.ac.ariel.smartclass.ui;

import android.content.Intent;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuItem;

import androidx.appcompat.app.AppCompatActivity;
import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;

import com.google.firebase.firestore.ListenerRegistration;

import java.util.ArrayList;
import java.util.List;

import il.ac.ariel.smartclass.R;
import il.ac.ariel.smartclass.data.Repo;

/**
 * What every screen shares: a menu with the language switch (Hebrew / English, decision Q9)
 * and sign-out, and automatic removal of live database listeners when the screen closes.
 */
public abstract class BaseActivity extends AppCompatActivity
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Menu item ids. */
    private static final int MENU_LANGUAGE = 1;
    private static final int MENU_SIGN_OUT = 2;

    /** Live listeners of this screen, removed in onDestroy. */
    private final List<ListenerRegistration> listeners = new ArrayList<ListenerRegistration>();

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Remembers a live listener so it is removed with the screen.
     * @param (ListenerRegistration) r The listener.
     */
    protected void keep(ListenerRegistration r)
    {
        listeners.add(r);
    }

    /**
     * Remembers several live listeners.
     * @param (ListenerRegistration[]) rs The listeners.
     */
    protected void keep(ListenerRegistration[] rs)
    {
        for (ListenerRegistration r : rs)
        {
            listeners.add(r);
        }
    }

    /**
     * Makes the top bar flat so it joins the course band under it.
     * @param (Bundle) saved Saved state.
     */
    @Override
    protected void onPostCreate(Bundle saved)
    {
        super.onPostCreate(saved);
        if (getSupportActionBar() != null)
        {
            getSupportActionBar().setElevation(0);
        }
    }

    /** Removes the live listeners. */
    @Override
    protected void onDestroy()
    {
        for (ListenerRegistration r : listeners)
        {
            r.remove();
        }
        listeners.clear();
        super.onDestroy();
    }

    /**
     * Adds the language and sign-out items.
     * @param (Menu) menu The menu.
     * @return (boolean) True to show it.
     */
    @Override
    public boolean onCreateOptionsMenu(Menu menu)
    {
        menu.add(Menu.NONE, MENU_LANGUAGE, Menu.NONE, getString(R.string.language));
        menu.add(Menu.NONE, MENU_SIGN_OUT, Menu.NONE, getString(R.string.sign_out));
        return true;
    }

    /**
     * Handles the menu.
     * @param (MenuItem) item The chosen item.
     * @return (boolean) True when handled.
     */
    @Override
    public boolean onOptionsItemSelected(MenuItem item)
    {
        if (item.getItemId() == MENU_LANGUAGE)
        {
            toggleLanguage();
            return true;
        }
        if (item.getItemId() == MENU_SIGN_OUT)
        {
            Repo.get().signOut();
            Intent i = new Intent(this, LoginActivity.class);
            i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(i);
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /** Switches Hebrew and English; AppCompat recreates the screens. */
    private void toggleLanguage()
    {
        LocaleListCompat now = AppCompatDelegate.getApplicationLocales();
        String next = "en";
        if (!now.isEmpty() && "en".equals(now.get(0).getLanguage()))
        {
            next = "he";
        }
        AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(next));
    }
}
