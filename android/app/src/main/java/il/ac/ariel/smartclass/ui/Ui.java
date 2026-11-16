package il.ac.ariel.smartclass.ui;

import android.app.Activity;
import android.content.Context;
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
import java.util.Date;

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
        Button b = new Button(parent.getContext());
        b.setText(text);
        b.setAllCaps(false);
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
     * Layout params: full width, natural height.
     * @return (LinearLayout.LayoutParams) Params.
     */
    private static LinearLayout.LayoutParams matchWidth()
    {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }
}
