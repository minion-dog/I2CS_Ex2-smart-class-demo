package il.ac.ariel.smartclass.ui;

import android.app.Activity;
import android.content.Context;
import android.content.res.Configuration;
import android.graphics.drawable.GradientDrawable;
import android.graphics.Typeface;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.text.DateFormat;
import java.util.Calendar;
import java.util.Date;

import il.ac.ariel.smartclass.R;

/**
 * Builds simple screens in code (columns of text, fields and buttons).
 * WHY in code and not XML layouts: the screens are lists and forms, and building them in one
 * place keeps every screen short and readable for the presentation; the strings still come
 * from res/values (Hebrew) and res/values-en (English).
 */
public final class Ui
{

    // ==========================================
    //             CONSTANTS & FIELDS
    // ==========================================

    /** Space around the screen, in dp. */
    private static final int PAD_DP = 16;

    /** Space between items, in dp. */
    private static final int GAP_DP = 8;

    /** Minimum touch size, in dp (accessibility). */
    private static final int TAP_DP = 48;

    /** Colours of the "soft colours" design (docs/DESIGN.md): the course band and the action colour. */
    public static final int COURSE = 0xFF0F7B6C;
    public static final int COURSE_NIGHT = 0xFF145E54;
    public static final int BRAND = 0xFF5B4BDB;
    public static final int BRAND_NIGHT = 0xFF9D92FF;

    /** Soft tints per kind of content, light and dark: violet, green, blue, sun, rose. */
    public static final int TINT_VIOLET = 0;
    public static final int TINT_GREEN = 1;
    public static final int TINT_BLUE = 2;
    public static final int TINT_SUN = 3;
    public static final int TINT_ROSE = 4;
    private static final int[] TINTS_DAY = { 0xFFEEEBFF, 0xFFE3F6EA, 0xFFE6F2FD, 0xFFFFF2D9, 0xFFFDE8EE };
    private static final int[] TINTS_NIGHT = { 0xFF26243A, 0xFF1C2A24, 0xFF1C2633, 0xFF2E2A1E, 0xFF2E2129 };

    /** Not instantiable. */
    private Ui()
    {
    }

    // ==========================================
    //                   ENTRY
    // ==========================================

    /**
     * Sets a scrolling column as the activity's content.
     * @param (Activity) a The screen.
     * @return (LinearLayout) The column to add views to.
     */
    public static LinearLayout screen(Activity a)
    {
        ScrollView scroll = new ScrollView(a);
        LinearLayout col = column(a);
        int pad = dp(a, PAD_DP);
        col.setPadding(pad, pad, pad, pad);
        scroll.addView(col);
        a.setContentView(scroll);
        return col;
    }

    /**
     * Creates a vertical column.
     * @param (Context) c Context.
     * @return (LinearLayout) The column.
     */
    public static LinearLayout column(Context c)
    {
        LinearLayout col = new LinearLayout(c);
        col.setOrientation(LinearLayout.VERTICAL);
        return col;
    }

    /**
     * Creates a horizontal row.
     * @param (Context) c Context.
     * @return (LinearLayout) The row.
     */
    public static LinearLayout row(Context c)
    {
        LinearLayout r = new LinearLayout(c);
        r.setOrientation(LinearLayout.HORIZONTAL);
        r.setGravity(Gravity.CENTER_VERTICAL);
        return r;
    }

    /**
     * Adds a title.
     * @param (LinearLayout) parent Where to add.
     * @param (String) text Title text.
     * @return (TextView) The title.
     */
    public static TextView title(LinearLayout parent, String text)
    {
        TextView t = text(parent, text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 20);
        t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(parent.getContext(), GAP_DP * 2), 0, dp(parent.getContext(), GAP_DP));
        return t;
    }

    /**
     * Adds a text line.
     * @param (LinearLayout) parent Where to add.
     * @param (String) text Text.
     * @return (TextView) The view.
     */
    public static TextView text(LinearLayout parent, String text)
    {
        TextView t = new TextView(parent.getContext());
        t.setText(text);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        t.setTextAlignment(View.TEXT_ALIGNMENT_VIEW_START);
        t.setPadding(0, dp(parent.getContext(), GAP_DP / 2), 0, dp(parent.getContext(), GAP_DP / 2));
        parent.addView(t, matchWidth());
        return t;
    }

    /**
     * Adds a button.
     * @param (LinearLayout) parent Where to add.
     * @param (String) text Label.
     * @param (View.OnClickListener) onClick What it does.
     * @return (Button) The button.
     */
    public static Button button(LinearLayout parent, String text, View.OnClickListener onClick)
    {
        Context c = parent.getContext();
        Button b = new Button(c);
        b.setText(text);
        b.setAllCaps(false);
        b.setTextColor(night(c) ? 0xFF15122E : 0xFFFFFFFF);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setStateListAnimator(null);
        b.setBackground(rounded(night(c) ? BRAND_NIGHT : BRAND, dp(c, 14)));
        b.setPadding(dp(c, 16), 0, dp(c, 16), 0);
        b.setMinHeight(dp(parent.getContext(), TAP_DP));
        b.setOnClickListener(onClick);
        LinearLayout.LayoutParams lp = matchWidth();
        if (parent.getOrientation() == LinearLayout.HORIZONTAL)
        {
            lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        }
        lp.topMargin = dp(parent.getContext(), GAP_DP / 2);
        parent.addView(b, lp);
        return b;
    }

    /**
     * Adds a one-line text field.
     * @param (LinearLayout) parent Where to add.
     * @param (String) hint Placeholder.
     * @return (EditText) The field.
     */
    public static EditText field(LinearLayout parent, String hint)
    {
        EditText e = new EditText(parent.getContext());
        e.setHint(hint);
        e.setSingleLine(true);
        e.setMinHeight(dp(parent.getContext(), TAP_DP));
        LinearLayout.LayoutParams lp = matchWidth();
        if (parent.getOrientation() == LinearLayout.HORIZONTAL)
        {
            lp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        }
        parent.addView(e, lp);
        return e;
    }

    /**
     * Adds a multi-line text field.
     * @param (LinearLayout) parent Where to add.
     * @param (String) hint Placeholder.
     * @param (int) lines Visible lines.
     * @return (EditText) The field.
     */
    public static EditText area(LinearLayout parent, String hint, int lines)
    {
        EditText e = field(parent, hint);
        e.setSingleLine(false);
        e.setMinLines(lines);
        e.setGravity(Gravity.TOP | Gravity.START);
        e.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        return e;
    }

    /**
     * Adds a container that is refilled by live data (lists of comments, polls, students).
     * @param (LinearLayout) parent Where to add.
     * @return (LinearLayout) The container.
     */
    public static LinearLayout box(LinearLayout parent)
    {
        LinearLayout b = column(parent.getContext());
        parent.addView(b, matchWidth());
        return b;
    }

    /**
     * Adds the coloured course band at the top of a screen (as on the website): a greeting
     * by the time of day, a big title and one detail line. It runs edge to edge with
     * rounded bottom corners.
     * @param (LinearLayout) parent The screen column from {@link #screen(Activity)}.
     * @param (String) title The big line (lecture or page title).
     * @param (String) sub The detail line ("" for none).
     * @return (LinearLayout) The band.
     */
    public static LinearLayout hero(LinearLayout parent, String title, String sub)
    {
        Context c = parent.getContext();
        LinearLayout band = column(c);
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(night(c) ? COURSE_NIGHT : COURSE);
        float r = dp(c, 28);
        bg.setCornerRadii(new float[] { 0, 0, 0, 0, r, r, r, r });
        band.setBackground(bg);
        int pad = dp(c, 20);
        band.setPadding(pad, dp(c, 18), pad, dp(c, 24));
        TextView hi = new TextView(c);
        hi.setText(greeting(c));
        hi.setTextColor(0xD9FFFFFF);
        hi.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        band.addView(hi, matchWidth());
        TextView big = new TextView(c);
        big.setText(title);
        big.setTextColor(0xFFFFFFFF);
        big.setTextSize(TypedValue.COMPLEX_UNIT_SP, 26);
        big.setTypeface(Typeface.DEFAULT_BOLD);
        band.addView(big, matchWidth());
        if (sub != null && !sub.isEmpty())
        {
            TextView small = new TextView(c);
            small.setText(sub);
            small.setTextColor(0xD9FFFFFF);
            small.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
            band.addView(small, matchWidth());
        }
        int edge = dp(c, PAD_DP);
        LinearLayout.LayoutParams lp = matchWidth();
        lp.setMargins(-edge, -edge, -edge, dp(c, GAP_DP * 2));
        parent.addView(band, lp);
        return band;
    }

    /**
     * Adds a rounded card in one of the soft tints; views are then added into it.
     * @param (LinearLayout) parent Where to add.
     * @param (int) tint One of the TINT_ constants.
     * @return (LinearLayout) The card.
     */
    public static LinearLayout card(LinearLayout parent, int tint)
    {
        Context c = parent.getContext();
        LinearLayout card = column(c);
        card.setBackground(rounded((night(c) ? TINTS_NIGHT : TINTS_DAY)[tint], dp(c, 22)));
        int pad = dp(c, PAD_DP);
        card.setPadding(pad, dp(c, GAP_DP), pad, pad);
        LinearLayout.LayoutParams lp = matchWidth();
        lp.topMargin = dp(c, GAP_DP);
        lp.bottomMargin = dp(c, GAP_DP);
        parent.addView(card, lp);
        return card;
    }

    /**
     * The greeting by the time of day, with the signed-in first name.
     * @param (Context) c Context.
     * @return (String) For example "Good evening, Maor".
     */
    public static String greeting(Context c)
    {
        int h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY);
        int id = R.string.greet_night;
        if (h >= 5 && h < 12)
        {
            id = R.string.greet_morning;
        }
        else if (h >= 12 && h < 17)
        {
            id = R.string.greet_noon;
        }
        else if (h >= 17 && h < 22)
        {
            id = R.string.greet_evening;
        }
        String name = il.ac.ariel.smartclass.data.Repo.get().myName();
        String first = name == null ? "" : name.trim().split(" ")[0];
        if (first.contains("@"))
        {
            first = first.substring(0, first.indexOf('@'));
        }
        return c.getString(id) + (first.isEmpty() ? "" : ", " + first);
    }

    /**
     * Tells whether the app is in dark mode.
     * @param (Context) c Context.
     * @return (boolean) True in dark mode.
     */
    public static boolean night(Context c)
    {
        int mode = c.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    /**
     * Shows a short message.
     * @param (Context) c Context.
     * @param (String) text Message.
     */
    public static void toast(Context c, String text)
    {
        Toast.makeText(c, text, Toast.LENGTH_LONG).show();
    }

    /**
     * Formats a time stamp for lists.
     * @param (long) ms Epoch milliseconds (0 = empty).
     * @return (String) Short date and time.
     */
    public static String when(long ms)
    {
        if (ms <= 0)
        {
            return "";
        }
        return DateFormat.getDateTimeInstance(DateFormat.SHORT, DateFormat.SHORT).format(new Date(ms));
    }

    /**
     * Converts dp to pixels.
     * @param (Context) c Context.
     * @param (int) value Value in dp.
     * @return (int) Pixels.
     */
    public static int dp(Context c, int value)
    {
        return Math.round(value * c.getResources().getDisplayMetrics().density);
    }

    // ==========================================
    //             LOW-LEVEL HELPERS
    // ==========================================

    /**
     * A filled shape with rounded corners.
     * @param (int) color Fill colour.
     * @param (int) radius Corner radius in pixels.
     * @return (GradientDrawable) The shape.
     */
    private static GradientDrawable rounded(int color, int radius)
    {
        GradientDrawable g = new GradientDrawable();
        g.setColor(color);
        g.setCornerRadius(radius);
        return g;
    }

    /**
     * Layout params: full width, natural height.
     * @return (LinearLayout.LayoutParams) Params.
     */
    private static LinearLayout.LayoutParams matchWidth()
    {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
}
