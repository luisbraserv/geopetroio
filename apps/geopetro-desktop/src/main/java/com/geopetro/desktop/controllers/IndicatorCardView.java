package com.geopetro.desktop.controllers;

import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.Pane;
import javafx.scene.text.TextAlignment;
import javafx.scene.transform.Scale;

/** Reflows the contents in the actual tile dimensions, without shrinking a fixed-size card. */
class IndicatorCardView extends Pane {
    private final Label title, value, unit, raw, alarm, state;
    private final Button bell, settings;
    private final Node visual;
    private final boolean instrument;
    private final Scale visualScale = new Scale(1, 1, 0, 0);

    IndicatorCardView(String name, String units, Node visual, boolean instrument,
                      Label value, Label raw, Label alarm, Button bell, Button settings) {
        this(name, units, visual, instrument, value, raw, alarm, new Label(), bell, settings);
        state.setManaged(false);
        state.setVisible(false);
    }

    IndicatorCardView(String name, String units, Node visual, boolean instrument,
                      Label value, Label raw, Label alarm, Label state, Button bell, Button settings) {
        this.title = new Label(name);
        this.unit = new Label(units);
        this.visual = visual; this.instrument = instrument;
        this.value = value; this.raw = raw; this.alarm = alarm;
        this.state = state;
        state.setWrapText(true);
        state.setTextAlignment(TextAlignment.CENTER);
        this.bell = bell; this.settings = settings;
        title.getStyleClass().add("card-grandeza-titulo");
        title.setWrapText(true); title.setTextAlignment(TextAlignment.CENTER);
        unit.getStyleClass().add("muted");
        for (Label label : new Label[]{title,value,unit,raw,alarm,state}) {
            label.setMinSize(0,0); label.setAlignment(Pos.CENTER);
        }
        raw.setAlignment(Pos.CENTER_RIGHT);
        visual.getTransforms().add(visualScale);
        visual.setManaged(false);
        getChildren().addAll(visual,title,value,unit,raw,alarm,state,bell,settings);
        setMinSize(0,0);
    }

    private static double bounded(double value,double min,double max) { return Math.max(min,Math.min(max,value)); }
    private static void font(Label label,double size,boolean bold) {
        label.setStyle("-fx-font-size: " + size + "px;" + (bold ? "-fx-font-weight: bold;" : ""));
    }
    @Override protected void layoutChildren() {
        double w=getWidth(), h=getHeight();
        if(w<=0 || h<=0) return;
        double pad=Math.min(16,Math.min(w*.08,h*.035));
        double inner=Math.max(1,w-2*pad), gap=Math.min(10,h*.018);
        double toolbar=bounded(Math.min(w*.16,h*.09),16,28);
        bell.resizeRelocate(pad,pad,toolbar,toolbar);
        settings.resizeRelocate(w-pad-toolbar,pad,toolbar,toolbar);
        bell.setStyle("-fx-font-size: "+Math.min(16,toolbar*.6)+"px; -fx-padding: 0;");
        settings.setStyle(bell.getStyle());
        font(title,bounded(Math.min(inner*.12,h*.06),11,22),true);
        double valueSize=bounded(Math.min(inner*.40,h*.16),22,88);
        var measure=new javafx.scene.text.Text(value.getText());
        measure.setFont(javafx.scene.text.Font.font("System",javafx.scene.text.FontWeight.BOLD,valueSize));
        if(measure.getLayoutBounds().getWidth()>inner) valueSize *= inner/measure.getLayoutBounds().getWidth();
        font(value,valueSize,true);
        font(unit,bounded(Math.min(inner*.10,h*.045),10,18),false);
        font(raw,bounded(Math.min(inner*.068,h*.032),8,12),false);
        double titleY=pad+toolbar+gap;
        double titleH=Math.min(h*.20,title.prefHeight(inner));
        title.resizeRelocate(pad,titleY,inner,titleH);
        double rawH=Math.min(20,h*.06);
        raw.resizeRelocate(pad,h-pad-rawH,Math.max(1,inner-12),rawH);
        double bottom=h-pad-rawH-gap;
        if(state.isManaged()) {
            font(state,bounded(Math.min(inner*.055,h*.03),9,12),false);
            double stateH=Math.min(state.prefHeight(inner),h*.16);
            state.resizeRelocate(pad,bottom-stateH,inner,stateH);
            bottom-=stateH+gap;
        }
        if(alarm.isManaged()) {
            double alarmH=Math.min(24,h*.07);
            font(alarm,bounded(inner*.09,10,16),true);
            alarm.resizeRelocate(pad,bottom-alarmH,inner,alarmH);
            bottom-=alarmH+gap;
        }
        double top=titleY+titleH+gap;
        double available=Math.max(1,bottom-top);
        double valueH=Math.min(valueSize*1.4,available*.50);
        font(value,Math.min(valueSize,valueH/1.35),true);
        double unitH=Math.min(unit.prefHeight(inner),available*.14);
        double drawingH=Math.max(1,available-valueH-unitH-2*gap);
        if(instrument) {
            fitVisual(pad,top,inner,drawingH);
            value.resizeRelocate(pad,top+drawingH+gap,inner,valueH);
            unit.resizeRelocate(pad,top+drawingH+gap+valueH,inner,unitH);
        } else {
            double iconH=Math.min(drawingH*.55,70);
            fitVisual(pad,top+drawingH*.15,inner,iconH);
            double valueY=top+Math.min(available*.48,Math.max(0,available-valueH-unitH-gap));
            value.resizeRelocate(pad,valueY,inner,valueH);
            unit.resizeRelocate(pad,valueY+valueH,inner,unitH);
        }
    }
    private void fitVisual(double x,double y,double width,double height) {
        if (visual instanceof TermometroView thermometer) thermometer.redimensionar(Math.min(140,width*.95),height);
        if (visual instanceof TanqueView tank) tank.redimensionar(width*.95,height);
        var bounds=visual.getLayoutBounds();
        double factor=Math.max(.01,Math.min(width/Math.max(1,bounds.getWidth()),height/Math.max(1,bounds.getHeight())));
        visualScale.setX(factor); visualScale.setY(factor);
        visual.setLayoutX(x+(width-bounds.getWidth()*factor)/2-bounds.getMinX()*factor);
        visual.setLayoutY(y+(height-bounds.getHeight()*factor)/2-bounds.getMinY()*factor);
    }
}
